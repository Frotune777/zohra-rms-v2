// Start the real application against fresh, disposable sample data.
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawn, execFileSync } = require("node:child_process");
const {
  root,
  ADMIN_URL,
  CLUSTER,
  databaseUrl,
  poolFor,
  bootstrap,
} = require("../tests/audit/database.cjs");
const frontend = "http://localhost:3002";
const backend = "http://127.0.0.1:5001";
const children = [];
let stopping = false;

function freePort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}

const seed = require("./demo-seed.cjs");

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null)
            return resolve();
          const timeout = setTimeout(() => child.kill("SIGKILL"), 3000);
          child.once("exit", () => {
            clearTimeout(timeout);
            resolve();
          });
          child.kill("SIGTERM");
        }),
    ),
  );
  console.log(
    "Frontend and API stopped. The sample database and local PostgreSQL cluster are retained.",
  );
  process.exit(code);
}

async function main() {
  if (Number(process.versions.node.split(".")[0]) < 24)
    throw new Error("Select Node from .nvmrc before starting the demo.");
  await freePort(3002);
  await freePort(5001);
  if (!fs.existsSync(path.join(CLUSTER, "PG_VERSION")))
    throw new Error(
      "The disposable audit PostgreSQL cluster is missing; see docs/audit/phase2/README.md.",
    );
  if (!fs.existsSync(path.join(CLUSTER, "postmaster.pid"))) {
    execFileSync(
      "pg_ctl",
      [
        "-D",
        CLUSTER,
        "-l",
        "/private/tmp/zohra-playwright-postgres.log",
        "-o",
        "-p 55439 -h 127.0.0.1 -k /private/tmp",
        "start",
      ],
      { stdio: "pipe" },
    );
  }
  const admin = poolFor(ADMIN_URL, true);
  const resume = process.env.ZOHRA_DEMO_DATABASE;
  if (resume && !/^zohra_pw_manual_[0-9]+$/.test(resume))
    throw new Error("Resume requires a guarded manual sample database.");
  const name = resume || "zohra_pw_manual_" + Date.now();
  const url = databaseUrl(name);
  let pool;
  let created = false;
  try {
    const directory = (await admin.query("SHOW data_directory")).rows[0]
      .data_directory;
    if (fs.realpathSync(directory) !== fs.realpathSync(CLUSTER))
      throw new Error("Wrong PostgreSQL cluster.");
    if (!resume) {
      await admin.query('CREATE DATABASE "' + name + '"');
      created = true;
    }
    pool = poolFor(url);
    if (resume) {
      await require("../server/scripts/migration-engine").migrate(pool, {
        adoptVerified: true,
      });
    } else {
      await bootstrap(pool);
      const seedClient = await pool.connect();
      try {
        await seed(seedClient);
      } finally {
        seedClient.release();
      }
    }
  } catch (error) {
    if (pool) {
      await pool.end();
      pool = null;
    }
    if (created) await admin.query('DROP DATABASE "' + name + '"');
    throw error;
  } finally {
    if (pool) await pool.end();
    await admin.end();
  }
  fs.mkdirSync(path.join(root, 'server/src/logs'), { recursive: true });
  const environment = {
    ...process.env,
    DATABASE_URL: url,
    JWT_SECRET: crypto.randomBytes(32).toString("hex"),
    PORT: "5001",
    CLIENT_URL: frontend,
    NODE_ENV: "development",
  };
  const api = spawn(process.execPath, [path.join(root, "server/server.js")], {
    cwd: root,
    env: environment,
    stdio: "inherit",
  });
  children.push(api);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (api.exitCode !== null || api.signalCode !== null)
      throw new Error("API exited during startup.");
    try {
      ready = (
        await fetch(backend + "/health", { signal: AbortSignal.timeout(500) })
      ).ok;
    } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  if (!ready) throw new Error("API did not become healthy.");
  const client = spawn(
    process.execPath,
    [
      path.join(root, "client/node_modules/vite/bin/vite.js"),
      "--host",
      "127.0.0.1",
      "--port",
      "3002",
      "--strictPort",
    ],
    {
      cwd: path.join(root, "client"),
      env: { ...environment, VITE_API_URL: backend + "/api" },
      stdio: "inherit",
    },
  );
  children.push(client);
  fs.writeFileSync(
    "/private/tmp/zohra-manual-runtime.json",
    JSON.stringify(
      {
        started_at: new Date().toISOString(),
        pid: process.pid,
        api_pid: api.pid,
        client_pid: client.pid,
        database: name,
        frontend,
        backend,
      },
      null,
      2,
    ) + "\n",
  );
  for (const child of children) {
    child.once("error", (error) => {
      console.error(error.message);
      stop(1);
    });
    child.once("exit", () => {
      if (!stopping) stop(1);
    });
  }
  console.log(
    "\nFrontend: " +
      frontend +
      "\nAPI: " +
      backend +
      "\nDisposable database: " +
      name,
  );
  console.log(
    "Owner: owner@alzohra.com / owner123\nManager: manager@alzohra.com / manager123\nStaff: staff@alzohra.com / staff123\nCtrl+C stops the frontend and API.",
  );
}
process.once("SIGINT", () => stop());
process.once("SIGTERM", () => stop());
main().catch((error) => {
  console.error("Demo startup failed: " + error.message);
  stop(1);
});
