const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { root, ADMIN_URL, CLUSTER, poolFor, databaseUrl, bootstrap, migrations, guard } = require('./database.cjs');
module.exports = async function () {
  if (process.env.PW_AUDIT_DATABASE_URL) guard(process.env.PW_AUDIT_DATABASE_URL);
  if (!fs.existsSync(path.join(CLUSTER, 'PG_VERSION'))) throw new Error('Isolated audit cluster is missing.');
  const startedCluster = !fs.existsSync(path.join(CLUSTER, 'postmaster.pid'));
  if (startedCluster) execFileSync('pg_ctl', ['-D', CLUSTER, '-l', '/private/tmp/zohra-playwright-postgres.log',
    '-o', '-p 55439 -h 127.0.0.1 -k /private/tmp', 'start'], {stdio:'pipe'});
  const admin = poolFor(ADMIN_URL, true);
  const name = 'zohra_pw_template_' + Date.now();
  let pool;
  try {
    const directory = await admin.query('SHOW data_directory');
    if (fs.realpathSync(directory.rows[0].data_directory) !== fs.realpathSync(CLUSTER)) throw new Error('Wrong PostgreSQL cluster.');
    await admin.query('CREATE DATABASE ' + name);
    pool = poolFor(databaseUrl(name));
    await bootstrap(pool);
    await bootstrap(pool);
    const count = await pool.query('SELECT count(*)::int AS count FROM playwright_schema_history');
    if (count.rows[0].count !== migrations.length) throw new Error('Incomplete bootstrap history.');
    process.env.PW_AUDIT_TEMPLATE = name;
    process.env.PW_AUDIT_RUN = name.split('_').at(-1);
    process.env.PW_AUDIT_STARTED_CLUSTER = startedCluster ? '1' : '0';
    fs.mkdirSync(path.join(root,'docs/audit/phase2'), {recursive:true});
    const version = await pool.query('SHOW server_version');
    fs.writeFileSync(path.join(root,'docs/audit/phase2/bootstrap.json'), JSON.stringify({
      status:'passed', migrations, applied:migrations.length, repeat_run:'passed',
      cluster:CLUSTER, database:name, postgres:version.rows[0].server_version,
      scope:'Canonical schema and required lookup defaults, no business samples. Docker execution and PostgreSQL 15 require separate verification.'
    },null,2)+'\n');
  } catch (error) {
    if (pool) { await pool.end(); pool=null; }
    await admin.query('DROP DATABASE IF EXISTS ' + name);
    throw error;
  } finally {
    if (pool) await pool.end();
    await admin.end();
    if (!process.env.PW_AUDIT_RUN && startedCluster) execFileSync('pg_ctl',['-D',CLUSTER,'stop'],{stdio:'pipe'});
  }
};
