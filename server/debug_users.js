const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://admin:password@localhost:5432/alzohra_db'
});

async function listUsers() {
    try {
        const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'");
        console.log('Columns:', cols.rows.map(r => r.column_name));

        const res = await pool.query('SELECT * FROM users');
        console.log('Users found:', res.rows);
        pool.end();
    } catch (err) {
        console.error(err);
        pool.end();
    }
}

listUsers();
