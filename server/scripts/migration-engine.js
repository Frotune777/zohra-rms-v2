const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const directory = path.resolve(__dirname, "../../database/canonical");
const migrations = ["001_baseline.sql", "002_lookup_seed.sql"];
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
async function describeSchema(c) {
  const data = {};
  data.columns = (
    await c.query(
      "SELECT table_name,column_name,ordinal_position,udt_name,is_nullable,column_default,character_maximum_length,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema='public' AND table_name NOT IN ('playwright_schema_history','schema_migrations') ORDER BY table_name,ordinal_position",
    )
  ).rows;
  data.constraints = (
    await c.query(
      "SELECT r.relname AS table_name,c.conname,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND r.relname NOT IN ('playwright_schema_history','schema_migrations') ORDER BY r.relname,c.conname",
    )
  ).rows;
  data.indexes = (
    await c.query(
      "SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename NOT IN ('playwright_schema_history','schema_migrations') ORDER BY tablename,indexname",
    )
  ).rows;
  data.functions = (
    await c.query(
      "SELECT p.proname,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY p.proname,pg_get_function_identity_arguments(p.oid)",
    )
  ).rows;
  data.enums = (
    await c.query(
      "SELECT t.typname,e.enumlabel,e.enumsortorder FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace JOIN pg_enum e ON e.enumtypid=t.oid WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder",
    )
  ).rows;
  data.views = (
    await c.query(
      "SELECT c.relname,pg_get_viewdef(c.oid) AS definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('v','m') ORDER BY c.relname",
    )
  ).rows;
  data.triggers = (
    await c.query(
      "SELECT c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname",
    )
  ).rows;
  return data;
}
async function fingerprint(c) {
  return hash(JSON.stringify(await describeSchema(c)));
}
async function migrate(
  pool,
  { checkOnly = false, adoptVerified = false } = {},
) {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(directory, "manifest.json")),
  );
  for (const file of manifest.files)
    if (
      !migrations.includes(file.path) ||
      hash(fs.readFileSync(path.join(directory, file.path))) !== file.sha256
    )
      throw new Error("Canonical migration checksum changed: " + file.path);
  if (manifest.files.length !== migrations.length)
    throw new Error("Canonical manifest incomplete");
  const c = await pool.connect();
  try {
    await c.query(checkOnly ? "BEGIN READ ONLY" : "BEGIN");
    await c.query("SET LOCAL search_path=public");
    if (!checkOnly)
      await c.query(
        "SELECT pg_advisory_xact_lock(hashtext('zohra-schema-migrations'))",
      );
    const exists = (
      await c.query("SELECT to_regclass('public.schema_migrations') AS name")
    ).rows[0].name;
    const history = exists
      ? (
          await c.query(
            "SELECT path,sha256 FROM schema_migrations ORDER BY path",
          )
        ).rows
      : [];
    for (const applied of history) {
      if (!migrations.includes(applied.path))
        throw new Error("Unknown migration in history: " + applied.path);
      if (
        hash(fs.readFileSync(path.join(directory, applied.path))) !==
        applied.sha256
      )
        throw new Error("Migration checksum changed: " + applied.path);
    }
    const pending = migrations.filter(
      (p) => !history.some((h) => h.path === p),
    );
    const tables = (
      await c.query(
        "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename NOT IN ('schema_migrations','playwright_schema_history')",
      )
    ).rows;
    let adopting = false;
    if (!history.length && tables.length) {
      if (!adoptVerified)
        throw new Error(
          "Existing untracked schema: use a reviewed migration plan or --adopt-verified for the exact checksum-verified legacy schema.",
        );
      const legacyExists = (
        await c.query(
          "SELECT to_regclass('public.playwright_schema_history') AS name",
        )
      ).rows[0].name;
      if (!legacyExists)
        throw new Error("Legacy migration evidence missing; adoption refused.");
      const legacy = (
        await c.query(
          "SELECT path,sha256 FROM playwright_schema_history ORDER BY path",
        )
      ).rows;
      const expected = JSON.parse(
        fs.readFileSync(path.join(directory, "legacy-manifest.json")),
      );
      if (
        legacy.length < 53 ||
        legacy.length > expected.length ||
        expected
          .slice(0, legacy.length)
          .some(
            (e) =>
              !legacy.some((h) => h.path === e.path && h.sha256 === e.sha256),
          )
      )
        throw new Error(
          "Legacy migration checksums disagree; adoption refused.",
        );
      if (legacy.length !== expected.length) {
        if (checkOnly)
          throw new Error(
            "Verified legacy upgrade is pending; --check makes no changes.",
          );
        const legacyRoot = path.resolve(directory, "../..");
        for (const file of expected.slice(legacy.length)) {
          const sql = fs.readFileSync(path.join(legacyRoot, file.path), "utf8");
          if (hash(sql) !== file.sha256)
            throw new Error("Legacy upgrade checksum changed: " + file.path);
          // Legacy files wrap BEGIN/COMMIT; keep them inside this atomic adoption transaction.
          await c.query(
            sql.replace(/^BEGIN;\s*/, "").replace(/COMMIT;\s*$/, ""),
          );
          await c.query(
            "INSERT INTO playwright_schema_history(path,sha256) VALUES($1,$2)",
            [file.path, file.sha256],
          );
        }
      }
      const expectedSchema = JSON.parse(
        fs.readFileSync(path.join(directory, "manifest.json")),
      ).legacy_schema_sha256;
      if ((await fingerprint(c)) !== expectedSchema)
        throw new Error(
          "Legacy schema differs from canonical schema; adoption refused.",
        );
      adopting = true;
    }
    if (!checkOnly) {
      await c.query(
        "CREATE TABLE IF NOT EXISTS schema_migrations(path TEXT PRIMARY KEY,sha256 TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT now())",
      );
      for (const file of pending) {
        const sql = fs.readFileSync(path.join(directory, file), "utf8");
        if (!adopting) {
          await c.query(sql);
          await c.query("SET LOCAL search_path=public");
        }
        await c.query(
          "INSERT INTO schema_migrations(path,sha256) VALUES($1,$2)",
          [file, hash(sql)],
        );
      }
    }
    await c.query("COMMIT");
    return {
      mode: checkOnly ? "check" : adopting ? "adopt" : "migrate",
      applied: checkOnly ? 0 : pending.length,
      pending: checkOnly ? pending : [],
      checksums: "verified",
    };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
module.exports = {
  migrate,
  migrations,
  directory,
  fingerprint,
  describeSchema,
};
