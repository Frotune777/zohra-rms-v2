const db = require('./src/config/db');
const fs = require('fs');
const path = require('path');

const MIGRATIONS = [
    '023_add_auditing_fields.sql',
    '024_create_stock_movements.sql',
    '025_create_pos_transactions.sql'
];

async function runMigrations() {
    console.log('Starting Schema Updates...\n');

    for (const file of MIGRATIONS) {
        try {
            console.log(`Running migration: ${file}...`);
            const migrationPath = path.join(__dirname, 'migrations', file);

            if (!fs.existsSync(migrationPath)) {
                console.error(`File not found: ${migrationPath}`);
                continue;
            }

            const sql = fs.readFileSync(migrationPath, 'utf8');
            await db.query(sql);
            console.log(`✓ ${file} completed successfully.\n`);
        } catch (error) {
            console.error(`✗ Failed to run ${file}:`, error.message);
            // Don't exit process, try next? Or stop? 
            // Better to stop on error to avoid inconsistent state.
            process.exit(1);
        }
    }

    console.log('All migrations executed successfully.');

    // Optional: Verify creation
    try {
        const tableCheck = await db.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name IN ('stock_movements', 'pos_transactions', 'pos_transaction_items')
        `);
        console.log('\nVerified Tables:', tableCheck.rows.map(r => r.table_name));
    } catch (err) {
        console.error('Verification failed:', err.message);
    }

    process.exit(0);
}

runMigrations();
