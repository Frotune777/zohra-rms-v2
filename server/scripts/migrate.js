const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgres://admin:password@localhost:5432/alzohra_db'
});

async function runMigrations() {
    console.log('🔄 Running database migrations...\n');

    try {
        const client = await pool.connect();

        // Read schema file
        const schemaPath = path.join(__dirname, '../../database/schema.sql');

        if (!fs.existsSync(schemaPath)) {
            console.error('✗ schema.sql not found at:', schemaPath);
            process.exit(1);
        }

        const schema = fs.readFileSync(schemaPath, 'utf8');

        console.log('📝 Executing schema...');
        await client.query(schema);

        console.log('✓ Database migrations completed successfully');

        client.release();
        await pool.end();
        process.exit(0);
    } catch (error) {
        console.error('✗ Migration failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

runMigrations();
