
const { Pool } = require('pg');

const connectionString = 'postgresql://admin:password@localhost:5433/alzohra_db';

const pool = new Pool({
    connectionString,
});

const tableName = process.argv[2] || 'suppliers';

pool.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = $1
`, [tableName], (err, res) => {
    if (err) {
        console.error('Error:', err);
    } else {
        console.log('Columns for', tableName, ':', res.rows);
    }
    pool.end();
});
