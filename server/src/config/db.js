const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('CRITICAL: DATABASE_URL must be set in environment variables');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});
module.exports = {
  query: (text, params) => {
    console.log(`DB Query: ${text} | Params: ${JSON.stringify(params)}`);
    return pool.query(text, params);
  },
  pool: pool
};