require('dotenv').config();
const db = require('./src/config/db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    const client = await db.pool.connect();
    try {
        console.log('=== Running Advance Recovery Validation Migration ===\n');

        // First, update any NULL paid_by values
        console.log('1. Updating NULL paid_by values...');
        const updateResult = await client.query(`
            UPDATE advance_ledger 
            SET paid_by = 'System' 
            WHERE paid_by IS NULL
        `);
        console.log(`   Updated ${updateResult.rowCount} records\n`);

        // Read and execute migration file
        const migrationPath = path.join(__dirname, 'migrations', '001_advance_recovery_validation.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

        console.log('2. Applying database constraints...');
        await client.query(migrationSQL);
        console.log('   ✅ Constraints applied\n');

        console.log('3. Verifying changes...');

        // Check if constraint exists
        const constraintCheck = await client.query(`
            SELECT constraint_name 
            FROM information_schema.table_constraints 
            WHERE table_name = 'advance_ledger' 
            AND constraint_name = 'advance_ledger_amount_positive'
        `);
        console.log(`   Amount constraint: ${constraintCheck.rows.length > 0 ? '✅' : '❌'}`);

        // Check if column exists
        const columnCheck = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'advance_ledger' 
            AND column_name = 'repayment_source'
        `);
        console.log(`   Repayment source column: ${columnCheck.rows.length > 0 ? '✅' : '❌'}`);

        // Check indexes
        const indexCheck = await client.query(`
            SELECT indexname 
            FROM pg_indexes 
            WHERE tablename = 'advance_ledger' 
            AND indexname IN ('idx_advance_ledger_employee_type', 'idx_advance_ledger_date')
        `);
        console.log(`   Indexes created: ${indexCheck.rows.length}/2 ✅\n`);

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

runMigration();
