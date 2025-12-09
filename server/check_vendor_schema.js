require('dotenv').config();
const db = require('./src/config/db');

async function checkVendorSchema() {
    try {
        console.log('=== CHECKING EXISTING VENDOR SCHEMA ===\n');

        // Check if suppliers table exists
        const suppliersCheck = await db.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'suppliers'
        `);

        if (suppliersCheck.rows.length > 0) {
            console.log('✅ suppliers table exists\n');

            // Get column details
            const columns = await db.query(`
                SELECT column_name, data_type, is_nullable, column_default
                FROM information_schema.columns
                WHERE table_name = 'suppliers'
                ORDER BY ordinal_position
            `);

            console.log('Columns:');
            columns.rows.forEach(col => {
                console.log(`  - ${col.column_name} (${col.data_type}) ${col.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
            });
            console.log('');
        } else {
            console.log('❌ suppliers table does NOT exist\n');
        }

        // Check vendor_ledger
        const ledgerCheck = await db.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'vendor_ledger'
        `);

        if (ledgerCheck.rows.length > 0) {
            console.log('✅ vendor_ledger table exists\n');

            const columns = await db.query(`
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_name = 'vendor_ledger'
                ORDER BY ordinal_position
            `);

            console.log('Columns:');
            columns.rows.forEach(col => {
                console.log(`  - ${col.column_name} (${col.data_type})`);
            });
            console.log('');
        } else {
            console.log('❌ vendor_ledger table does NOT exist\n');
        }

        // Check bill_entries
        const billCheck = await db.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'bill_entries'
        `);

        if (billCheck.rows.length > 0) {
            console.log('✅ bill_entries table exists\n');
        } else {
            console.log('❌ bill_entries table does NOT exist\n');
        }

        // Check chart_of_accounts for expense accounts
        console.log('Checking expense accounts in chart_of_accounts:');
        const expenseAccounts = await db.query(`
            SELECT code, name, type
            FROM chart_of_accounts
            WHERE type IN ('Expense', 'COGS')
            ORDER BY code
        `);

        console.log(`Found ${expenseAccounts.rows.length} expense/COGS accounts:`);
        expenseAccounts.rows.forEach(acc => {
            console.log(`  ${acc.code}: ${acc.name} (${acc.type})`);
        });

    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        process.exit();
    }
}

checkVendorSchema();
