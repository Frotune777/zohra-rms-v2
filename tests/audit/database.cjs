const { Pool } = require('pg');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const ADMIN_URL = 'postgresql://zohra_audit@127.0.0.1:55439/postgres';
const CLUSTER = '/private/tmp/zohra-audit-pg';
function guard(url, allowAdmin = false) {
  const value = new URL(url);
  const name = value.pathname.slice(1);
  if (value.hostname !== '127.0.0.1' || value.port !== '55439' ||
      value.username !== 'zohra_audit' || value.password ||
      (!((allowAdmin && name === 'postgres') || /^zohra_pw_[a-z0-9_]+$/.test(name)))) {
    throw new Error('Playwright requires a disposable zohra_pw_* database on the audit cluster.');
  }
  return name;
}
function poolFor(url, allowAdmin = false) {
  guard(url, allowAdmin);
  return new Pool({ connectionString: url, connectionTimeoutMillis: 5000 });
}
function databaseUrl(name) {
  const url = 'postgresql://zohra_audit@127.0.0.1:55439/' + name;
  guard(url);
  return url;
}
// The same immutable schema authority serves CLI, Docker and disposable audits.
const engine=require('../../server/scripts/migration-engine');
const migrations=engine.migrations.map(p=>'database/canonical/'+p);
async function bootstrap(pool){
 guard(pool.options.connectionString);
 await engine.migrate(pool);
 await pool.query('CREATE TABLE IF NOT EXISTS playwright_schema_history(path TEXT PRIMARY KEY,sha256 TEXT NOT NULL,applied_at TIMESTAMPTZ DEFAULT now())');
 for(const file of migrations){
  const hash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
  const old=(await pool.query('SELECT sha256 FROM playwright_schema_history WHERE path=$1',[file])).rows[0];
  if(old && old.sha256!==hash)throw new Error('Audit migration checksum changed: '+file);
  if(!old)await pool.query('INSERT INTO playwright_schema_history(path,sha256) VALUES($1,$2)',[file,hash]);
 }
}
module.exports={root,ADMIN_URL,CLUSTER,guard,poolFor,databaseUrl,migrations,bootstrap};
