const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });

if (!process.env.DATABASE_URL) {
  console.error('CRITICAL: DATABASE_URL must be set in environment variables');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20, // Increase pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000, // Fail fast if DB is busy
});

const fs = require('fs');
const path = require('path');
let logStream;
try {
  logStream = fs.createWriteStream(path.join(__dirname, '../logs/db.log'), { flags: 'a' });
} catch (err) {
  console.error('Failed to create DB log stream:', err.message);
  logStream = {
    write: (msg) => console.log('[DB LOG]', msg.trim())
  };
}

logStream.on('error', (err) => {
  console.error('DB Log Stream Error:', err.message);
});

module.exports = {
  query: (text, params) => {
    const start = Date.now();
    return pool.query(text, params).then(res => {
      const duration = Date.now() - start;
      logStream.write(`[${new Date().toISOString()}] QUERY: ${text} | PARAMS: ${JSON.stringify(params)} | DURATION: ${duration}ms\n`);
      return res;
    }).catch(err => {
      logStream.write(`[${new Date().toISOString()}] ERROR: ${err.message} | QUERY: ${text}\n`);
      throw err;
    });
  },
  pool: pool
};