// Audit only a disposable database. Never run repository SQL against app data.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { Pool } = require('pg');

const root = path.resolve(__dirname, '..');
const pool = new Pool({
  connectionString: process.env.AUDIT_DATABASE_URL ||
    'postgresql://zohra_audit@127.0.0.1:55439/postgres',
  connectionTimeoutMillis: 5000,
});
const psqlArgs = ['-h', '127.0.0.1', '-p', '55439', '-U', 'zohra_audit'];
const filesIn = directory => fs.readdirSync(path.join(root, directory))
  .filter(name => name.endsWith('.sql')).sort().map(name => `${directory}/${name}`);

async function run() {
  const connection = new URL(pool.options.connectionString);
  if (connection.hostname !== '127.0.0.1' || connection.port !== '55439' ||
      connection.username !== 'zohra_audit' || connection.pathname !== '/postgres') {
    throw new Error('This script requires the isolated audit cluster on port 55439.');
  }
  const results = [];
  const runId = Date.now();
  for (const mode of ['docker-initialization', 'diagnostic-combined']) {
    const database = `${mode === 'docker-initialization' ? 'zohra_audit_bootstrap' : 'zohra_audit_diagnostic'}_${runId}`;
    await pool.query(`CREATE DATABASE ${database}`);
    const files = filesIn('database');
    if (mode === 'diagnostic-combined') files.push(
      ...filesIn('server/migrations'), ...filesIn('database/migrations'),
      ...filesIn('server/src/modules/finance/migrations'));
    const checks = [];
    for (const file of files) {
      const result = spawnSync('psql', [...psqlArgs, '-d', database,
        '-v', 'ON_ERROR_STOP=1', '-f', path.join(root, file)], { encoding: 'utf8' });
      checks.push({ file, status: result.status, error: result.stderr.trim() });
      if (mode === 'docker-initialization' && result.status !== 0) break;
    }
    results.push({ mode, database, checks,
      interpretation: mode === 'diagnostic-combined'
        ? 'Best-effort diagnostics, NOT a supported or successful migration procedure.'
        : 'Top-level database SQL files in the order used by the Docker init mount.' });
  }
  const output = path.join(root, 'docs/audit/schema-results.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify(results.map(result => ({mode: result.mode,
    attempted: result.checks.length, failed: result.checks.filter(check => check.status !== 0)
      .map(check => ({file: check.file, error: check.error}))})), null, 2));
}
run().catch(error => { console.error(error.message); process.exitCode = 1; })
  .finally(() => pool.end());
