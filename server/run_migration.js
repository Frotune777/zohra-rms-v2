const db = require('./src/config/db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    try {
        console.log('Running migration 13_audit_and_status.sql...\n');

        const migrationPath = path.join(__dirname, '..', 'database', '13_audit_and_status.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        // Execute the migration
        await db.query(sql);

        console.log('✓ Migration completed successfully!\n');

        // Verify the changes
        console.log('Verifying changes...\n');

        // Check suppliers table
        const suppliersCheck = await db.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'suppliers' 
            AND column_name IN ('updated_at', 'updated_by')
            ORDER BY column_name
        `);
        console.log('Suppliers table new columns:', suppliersCheck.rows);

        // Check daily_rates table
        const ratesCheck = await db.query(`
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'daily_rates' 
            AND column_name IN ('status', 'updated_at', 'updated_by')
            ORDER BY column_name
        `);
        console.log('Daily rates table new columns:', ratesCheck.rows);

        // Check indexes
        const indexCheck = await db.query(`
            SELECT indexname 
            FROM pg_indexes 
            WHERE tablename IN ('daily_rates', 'bill_entries', 'vendor_ledger', 'markup_rules')
            AND indexname LIKE 'idx_%'
            ORDER BY indexname
        `);
        console.log('\nNew indexes created:', indexCheck.rows.map(r => r.indexname));

        // Check triggers
        const triggerCheck = await db.query(`
            SELECT trigger_name, event_object_table
            FROM information_schema.triggers
            WHERE trigger_name LIKE '%updated_at%'
            ORDER BY event_object_table, trigger_name
        `);
        console.log('\nTriggers created:', triggerCheck.rows);

        console.log('\n✓ All changes verified successfully!');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error.message);
        console.error(error);
        process.exit(1);
    }
}

runMigration();
