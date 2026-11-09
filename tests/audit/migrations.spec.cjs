const fs = require("fs"),
  path = require("path");
const { test, expect } = require("./fixtures.cjs");
const db = require("./database.cjs");
const engine = require("../../server/scripts/migration-engine");
async function isolated(fn) {
  const admin = db.poolFor(db.ADMIN_URL, true);
  const name = "zohra_pw_migration_" + Date.now();
  let pool;
  try {
    await admin.query("CREATE DATABASE " + name);
    pool = db.poolFor(db.databaseUrl(name));
    await fn(pool);
  } finally {
    if (pool) await pool.end();
    await admin.query("DROP DATABASE IF EXISTS " + name);
    await admin.end();
  }
}
test("DATA-001 canonical fresh migration and repeat initialize no sample business data", async () =>
  isolated(async (pool) => {
    const before = await engine.migrate(pool, { checkOnly: true });
    expect(before.pending).toHaveLength(2);
    expect(
      (
        await pool.query(
          "SELECT tablename FROM pg_tables WHERE schemaname='public'",
        )
      ).rows,
    ).toHaveLength(0);
    expect((await engine.migrate(pool)).applied).toBe(2);
    expect((await engine.migrate(pool)).applied).toBe(0);
    expect(await engine.fingerprint(pool)).toBe(
      JSON.parse(fs.readFileSync(path.join(engine.directory, "manifest.json")))
        .schema_sha256,
    );
    for (const table of [
      "employees",
      "users",
      "inventory_items",
      "orders",
      "suppliers",
      "menu_items",
    ])
      expect(
        Number(
          (await pool.query("SELECT count(*) FROM " + table)).rows[0].count,
        ),
      ).toBe(0);
  }));
test("DATA-001 verified legacy upgrade preserves synthetic existing payroll, employees and stock", async () =>
  isolated(async (pool) => {
    const legacy = JSON.parse(
      fs.readFileSync(path.join(engine.directory, "legacy-manifest.json")),
    );
    await pool.query(
      "CREATE TABLE playwright_schema_history(path TEXT PRIMARY KEY,sha256 TEXT NOT NULL,applied_at TIMESTAMPTZ DEFAULT now())",
    );
    for (const file of legacy.slice(0, 53)) {
      await pool.query(fs.readFileSync(path.join(db.root, file.path), "utf8"));
      await pool.query(
        "INSERT INTO playwright_schema_history(path,sha256) VALUES($1,$2)",
        [file.path, file.sha256],
      );
    }
    await pool.query(
      "INSERT INTO inventory_items(name,stock_qty,unit_cost,unit) VALUES('Existing synthetic stock',7.25,19.99,'kg')",
    );
    const before = (
      await pool.query("SELECT to_jsonb(t) AS row FROM employees t ORDER BY id")
    ).rows;
    const stock = (
      await pool.query(
        "SELECT stock_qty,unit_cost FROM inventory_items WHERE name='Existing synthetic stock'",
      )
    ).rows;
    expect((await engine.migrate(pool, { adoptVerified: true })).mode).toBe(
      "adopt",
    );
    expect((await engine.migrate(pool)).applied).toBe(0);
    expect(
      (
        await pool.query(
          "SELECT to_jsonb(t) AS row FROM employees t ORDER BY id",
        )
      ).rows,
    ).toEqual(before);
    expect(
      (
        await pool.query(
          "SELECT stock_qty,unit_cost FROM inventory_items WHERE name='Existing synthetic stock'",
        )
      ).rows,
    ).toEqual(stock);
    expect(await engine.fingerprint(pool)).toBe(
      JSON.parse(fs.readFileSync(path.join(engine.directory, "manifest.json")))
        .legacy_schema_sha256,
    );
  }));
test("DATA-001 migration rejects unknown schemas and tampered legacy evidence atomically", async () =>
  isolated(async (pool) => {
    await pool.query("CREATE TABLE unexpected(id INT)");
    await expect(engine.migrate(pool)).rejects.toThrow(
      "Existing untracked schema",
    );
    await expect(engine.migrate(pool, { adoptVerified: true })).rejects.toThrow(
      "Legacy migration evidence missing",
    );
    expect(
      (
        await pool.query(
          "SELECT tablename FROM pg_tables WHERE schemaname='public'",
        )
      ).rows.map((r) => r.tablename),
    ).toEqual(["unexpected"]);
  }));
test("DATA-001 canonical fresh demo seed creates working role credentials and balanced sample books", async () =>
  isolated(async (pool) => {
    await engine.migrate(pool);
    const c = await pool.connect();
    try {
      await require("../../scripts/demo-seed.cjs")(c);
    } finally {
      c.release();
    }
    const bcrypt = require("../../server/node_modules/bcryptjs");
    for (const role of ["owner", "manager", "staff"]) {
      const user = (
        await pool.query("SELECT * FROM users WHERE email=$1", [
          role + "@alzohra.com",
        ])
      ).rows[0];
      expect(user.role).toBe(role);
      expect(await bcrypt.compare(role + "123", user.password_hash)).toBe(true);
    }
    expect(
      Number(
        (
          await pool.query(
            "SELECT SUM(debit-credit) AS amount FROM ledger_lines",
          )
        ).rows[0].amount,
      ),
    ).toBe(0);
    expect(
      Number(
        (await pool.query("SELECT COUNT(*) FROM inventory_items")).rows[0]
          .count,
      ),
    ).toBeGreaterThan(0);
  }));
