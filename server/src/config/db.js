const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://admin:password@localhost:5432/alzohra_db'
});
module.exports = {
  query: (text, params) => pool.query(text, params),
  pool: pool
};