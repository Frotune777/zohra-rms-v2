const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgres://admin:password@localhost:5432/alzohra_db"
});

const runSchema = async () => {
    try {
        const sqlPath = path.join(__dirname, '../database', 'phase2_schema.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Running schema...');
        await pool.query(sql);
        console.log('Schema executed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Error executing schema:', err);
        process.exit(1);
    }
};

runSchema();
