const db = require('./src/config/db');

async function checkTables() {
    try {
        console.log('--- Checking Suppliers Table ---');
        const suppliers = await db.query('SELECT id, name FROM suppliers');
        console.log(`Suppliers Count: ${suppliers.rows.length}`);
        if (suppliers.rows.length > 0) {
            console.log('Sample Suppliers:', suppliers.rows.slice(0, 3));
        }

        console.log('\n--- Checking for "vendors" table ---');
        try {
            const vendors = await db.query('SELECT * FROM vendors');
            console.log(`Vendors Table Count: ${vendors.rows.length}`);
        } catch (e) {
            console.log('Vendors table does not exist or error:', e.message);
        }

        console.log('\n--- Checking Vendor Ledger ---');
        const ledger = await db.query('SELECT * FROM vendor_ledger LIMIT 5');
        console.log(`Ledger Rows Count (Preview): ${ledger.rows.length}`);

    } catch (err) {
        console.error('Error:', err);
    } finally {
        // We'll let the script extend/timeout or just exit manually if needed, 
        // but typically db pool keeps it open. 
        // We can force exit.
        process.exit(0);
    }
}

checkTables();
