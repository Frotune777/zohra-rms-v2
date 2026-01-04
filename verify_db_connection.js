
const { Pool } = require('pg');

const connectionString = 'postgresql://admin:password@localhost:5433/alzohra_db';

const pool = new Pool({
    connectionString,
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Connection Error:', err);
    } else {
        console.log('Connection Success:', res.rows[0]);
    }
    pool.end();
});
