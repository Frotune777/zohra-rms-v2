require('dotenv').config();
const db = require('./src/config/db');
const fs = require('fs');
const path = require('path');

async function runVendorMigration() {
    const client = await db.pool.connect();
    try {
        console.log('=== Running Vendor Payment System Migration ===\n');

        // Read and execute migration file
        const migrationPath = path.join(__dirname, 'migrations', '002_vendor_payment_system.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        console.log('1. Applying database schema changes...');
        await client.query(migrationSQL);
        console.log('   ✅ Schema changes applied\n');

        console.log('2. Verifying changes...');

        // Check vendor_categories table
        const categoriesCheck = await client.query(`
            SELECT COUNT(*) as count FROM vendor_categories
        `);
        console.log(`   vendor_categories: ${categoriesCheck.rows[0].count} categories ✅`);

        // Check vendor_payments table
        const paymentsTableCheck = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_name = 'vendor_payments'
        `);
        console.log(`   vendor_payments table: ${paymentsTableCheck.rows.length > 0 ? '✅' : '❌'}`);

        // Check new columns in suppliers
        const suppliersColumns = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'suppliers' 
            AND column_name IN ('category_id', 'opening_balance', 'notes')
        `);
        console.log(`   suppliers new columns: ${suppliersColumns.rows.length}/3 ✅`);

        // Check vendor_outstanding view
        const viewCheck = await client.query(`
            SELECT table_name 
            FROM information_schema.views 
            WHERE table_name = 'vendor_outstanding'
        `);
        console.log(`   vendor_outstanding view: ${viewCheck.rows.length > 0 ? '✅' : '❌'}`);

        // Check indexes
        const indexCheck = await client.query(`
            SELECT indexname 
            FROM pg_indexes 
            WHERE tablename IN ('vendor_payments', 'vendor_ledger')
            AND indexname LIKE 'idx_%'
        `);
        console.log(`   Indexes created: ${indexCheck.rows.length} ✅\n`);

        console.log('=== Migration Completed Successfully ===');

    } catch (err) {
        console.error('Migration failed:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        client.release();
        process.exit(0);
    }
}

runVendorMigration();
