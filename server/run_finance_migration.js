const fs = require('fs');
const path = require('path');

// Set env var for localhost connection
process.env.DATABASE_URL = 'postgres://admin:password@localhost:5432/alzohra_db';

const db = require('./src/config/db');

async function runMigration() {
    try {
        console.log('Running migration 001_finance_updates.sql...\n');

        const migrationPath = path.join(__dirname, 'src', 'modules', 'finance', 'migrations', '001_finance_updates.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        // Execute the migration
        await db.query(sql);

        console.log('✓ Migration completed successfully!\n');

        // Verify the changes
        console.log('Verifying changes...\n');

        // Check transaction_categories table
        const categoriesCheck = await db.query(`
            SELECT count(*) as count FROM transaction_categories
        `);
        console.log('Categories count:', categoriesCheck.rows[0].count);

        // Check transactions table columns
        const transactionsCheck = await db.query(`
            SELECT column_name
            FROM information_schema.columns 
            WHERE table_name = 'transactions' 
            AND column_name IN ('category_id', 'mode')
        `);
        console.log('Transactions new columns:', transactionsCheck.rows.map(r => r.column_name));

        // Check daily_balances table
        const balancesCheck = await db.query(`
            SELECT table_name FROM information_schema.tables WHERE table_name = 'daily_balances'
        `);
        console.log('Daily balances table exists:', balancesCheck.rows.length > 0);

        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

runMigration();
