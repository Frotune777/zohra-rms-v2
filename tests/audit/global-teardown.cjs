const { execFileSync } = require('node:child_process');
const { ADMIN_URL, CLUSTER, poolFor, databaseUrl, guard } = require('./database.cjs');
module.exports = async function () {
  if (!process.env.PW_AUDIT_RUN) return;
  const pool = poolFor(ADMIN_URL,true);
  try {
    const result = await pool.query('SELECT datname FROM pg_database WHERE datname LIKE $1', ['zohra_pw_%_' + process.env.PW_AUDIT_RUN]);
    for (const {datname} of result.rows) {
      guard(databaseUrl(datname));
      await pool.query('DROP DATABASE IF EXISTS "' + datname + '"');
    }
  } finally {
    await pool.end();
    if (process.env.PW_AUDIT_STARTED_CLUSTER === '1') execFileSync('pg_ctl',['-D',CLUSTER,'stop'],{stdio:'pipe'});
  }
};
