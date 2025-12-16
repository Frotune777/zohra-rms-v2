const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

const runSchema = async () => {
    try {
        const sqlPath = path.join(__dirname, '../../database', '06_critical_fixes.sql');
        console.log(`Reading SQL from: ${sqlPath}`);
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Running critical fixes schema...');
        await pool.query(sql);
        console.log('Schema executed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('Error executing schema:', err);
        process.exit(1);
    }
};

runSchema();
