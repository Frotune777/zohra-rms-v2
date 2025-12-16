const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Running migration: Add details columns to suppliers table...');
        await client.query('BEGIN');

        await client.query(`
            ALTER TABLE suppliers 
            ADD COLUMN IF NOT EXISTS contact_person VARCHAR(100),
            ADD COLUMN IF NOT EXISTS email VARCHAR(100),
            ADD COLUMN IF NOT EXISTS address TEXT,
            ADD COLUMN IF NOT EXISTS gstin VARCHAR(50);
        `);

        await client.query('COMMIT');
        console.log('Migration successful: Columns added.');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Migration failed:', err);
    } finally {
        client.release();
        pool.end();
    }
}

migrate();
