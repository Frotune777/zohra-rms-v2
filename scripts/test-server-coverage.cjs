// Collect unit and real disposable API/browser coverage from this exact source revision.
// Neither failed tests nor stale artifacts can satisfy the combined 70% gate.
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, ".."),
  server = path.join(root, "server");
const requireServer = (id) => require(path.join(server, "node_modules", id));
const { createCoverageMap } = requireServer("istanbul-lib-coverage");
const { mergeProcessCovs } = requireServer("@bcoe/v8-coverage");
const convert = requireServer("v8-to-istanbul");
function sources() {
  const rows = {};
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (file.endsWith(".js"))
        rows[file] = crypto
          .createHash("sha256")
          .update(fs.readFileSync(file))
          .digest("hex");
    }
  };
  visit(path.join(server, "src"));
  return rows;
}
function run(file, args, env = {}) {
  const result = spawnSync(process.execPath, [file, ...args], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status;
}
(async () => {
  const revision = sources(),
    temp = fs.mkdtempSync(path.join(os.tmpdir(), "zohra-coverage-")),
    units = path.join(temp, "units"),
    v8dir = path.join(temp, "v8");
  fs.mkdirSync(v8dir);
  const unitCode = run(path.join(server, "node_modules/jest/bin/jest.js"), [
    "--config",
    path.join(server, "jest.config.js"),
    "--runInBand",
    "--coverage",
    "--coverageProvider=v8",
    "--coverageDirectory",
    units,
    "--json",
    "--outputFile",
    path.join(temp, "unit-results.json"),
  ]);
  const unitResults = JSON.parse(
    fs.readFileSync(path.join(temp, "unit-results.json")),
  );
  if (
    unitResults.numFailedTests ||
    unitResults.numFailedTestSuites ||
    unitResults.numPendingTests ||
    unitResults.numPassedTests !== unitResults.numTotalTests
  )
    throw new Error(
      "Unit assertions failed or were skipped; combined coverage refused.",
    );
  const browserCode = run(
    path.join(root, "node_modules/@playwright/test/cli.js"),
    ["test", "--config=" + path.join(root, "playwright.audit.config.cjs")],
    { ZOHRA_AUDIT_V8_DIR: v8dir },
  );
  if (browserCode !== 0)
    throw new Error("Full Playwright audit failed; combined coverage refused.");
  if (JSON.stringify(revision) !== JSON.stringify(sources()))
    throw new Error(
      "Server sources changed during coverage run; rerun on a stable revision.",
    );
  const processes = fs
    .readdirSync(v8dir)
    .filter((p) => p.endsWith(".json"))
    .map((p) => JSON.parse(fs.readFileSync(path.join(v8dir, p))));
  if (!processes.length) throw new Error("No real API coverage was recorded.");
  const map = createCoverageMap(
    JSON.parse(fs.readFileSync(path.join(units, "coverage-final.json"))),
  );
  const { fileURLToPath } = require("node:url");
  for (const script of mergeProcessCovs(processes).result) {
    if (!script.url.startsWith("file:")) continue;
    const file = fileURLToPath(script.url);
    if (
      !revision[file] ||
      file.endsWith("/config/db.js") ||
      file.endsWith("/socket.js")
    )
      continue;
    const converter = convert(file, 0, {
      source: fs.readFileSync(file, "utf8"),
    });
    await converter.load();
    converter.applyCoverage(script.functions);
    map.merge(converter.toIstanbul());
    converter.destroy();
  }
  const output = path.join(root, "docs/audit/phase2/server-combined-coverage");
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(
    path.join(output, "coverage-final.json"),
    JSON.stringify(map.toJSON()),
  );
  const summary = map.getCoverageSummary().toJSON();
  const thresholds = require(path.join(server, "jest.config.js"))
    .coverageThreshold.global;
  const failed = Object.entries(thresholds).filter(
    ([metric, minimum]) => summary[metric].pct < minimum,
  );
  const result = {
    finished_at: new Date().toISOString(),
    scope:
      "V8 unit plus full real PostgreSQL/API/Playwright coverage. Same source hashes, no stale input, unchanged global thresholds. Standalone unit coverage is reported separately.",
    unit_assertions: unitResults.numPassedTests,
    standalone_unit_exit_code: unitCode,
    real_api_coverage_files: processes.length,
    thresholds,
    summary,
    passed: failed.length === 0,
    source_sha256: revision,
    temporary_artifacts: temp,
  };
  fs.writeFileSync(
    path.join(output, "summary.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  const reports = requireServer("istanbul-reports"),
    libReport = requireServer("istanbul-lib-report");
  const context = libReport.createContext({ dir: output, coverageMap: map });
  reports.create("text").execute(context);
  reports.create("html").execute(context);
  console.log(
    JSON.stringify({ passed: result.passed, summary, output }, null, 2),
  );
  if (failed.length)
    throw new Error(
      "Combined coverage below unchanged threshold: " +
        failed.map(([m]) => m).join(", "),
    );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
