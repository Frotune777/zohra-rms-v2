const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://admin:password@localhost:5432/alzohra_db',
});

async function runMigration() {
    const client = await pool.connect();
    try {
        console.log('Running 10_financial_periods.sql...');
        const sqlPath = path.join(__dirname, '../../database/10_financial_periods.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        await client.query(sql);
        console.log('Financial Period Migration completed successfully.');
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        client.release();
        pool.end();
    }
}

runMigration();
