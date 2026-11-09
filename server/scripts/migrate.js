const { Pool } = require("pg");
const { migrate } = require("./migration-engine");
// No .env loading or implicit business database. Caller must select the target.
(async () => {
  if (!process.env.DATABASE_URL)
    throw new Error("Explicit DATABASE_URL is required.");
  const allowed = new Set(["--check", "--adopt-verified"]);
  for (const arg of process.argv.slice(2))
    if (!allowed.has(arg)) throw new Error("Unknown migration option: " + arg);
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    console.log(
      JSON.stringify(
        await migrate(pool, {
          checkOnly: process.argv.includes("--check"),
          adoptVerified: process.argv.includes("--adopt-verified"),
        }),
      ),
    );
  } finally {
    await pool.end();
  }
})().catch((e) => {
  console.error("Migration failed: " + e.message);
  process.exitCode = 1;
});
