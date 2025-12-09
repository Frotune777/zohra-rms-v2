const db = require('./src/config/db');

async function verifyImport() {
    try {
        console.log('Verifying imported data...\n');

        // 1. Check vendor
        const vendor = await db.query(
            'SELECT * FROM suppliers WHERE name = $1',
            ['Golden Chicken']
        );
        console.log('Vendor:', vendor.rows[0]);
        console.log('');

        // 2. Check daily rates
        const ratesCount = await db.query('SELECT COUNT(*) FROM daily_rates');
        console.log(`Total daily rates: ${ratesCount.rows[0].count}`);

        const ratesSample = await db.query(
            'SELECT * FROM daily_rates ORDER BY date DESC LIMIT 5'
        );
        console.log('\nLatest 5 daily rates:');
        ratesSample.rows.forEach(row => {
            console.log(`  ${row.date}: Tandoor=${row.tandoor_rate}, Boiler=${row.boiler_rate}, Egg=${row.egg_rate}`);
        });

        const ratesDateRange = await db.query(
            'SELECT MIN(date) as min_date, MAX(date) as max_date FROM daily_rates'
        );
        console.log(`\nDate range: ${ratesDateRange.rows[0].min_date} to ${ratesDateRange.rows[0].max_date}`);

        // 3. Check bill entries
        const billsCount = await db.query(
            'SELECT COUNT(*) FROM bill_entries WHERE supplier_id = $1',
            [vendor.rows[0].id]
        );
        console.log(`\nTotal bill entries for Golden Chicken: ${billsCount.rows[0].count}`);

        const billsByItem = await db.query(
            `SELECT item_name, COUNT(*) as count, 
                    SUM(qty) as total_qty, 
                    AVG(vendor_rate) as avg_rate
             FROM bill_entries 
             WHERE supplier_id = $1
             GROUP BY item_name
             ORDER BY item_name`,
            [vendor.rows[0].id]
        );
        console.log('\nBill entries by item:');
        billsByItem.rows.forEach(row => {
            console.log(`  ${row.item_name}: ${row.count} entries, Total Qty: ${parseFloat(row.total_qty).toFixed(2)}, Avg Rate: ${parseFloat(row.avg_rate).toFixed(2)}`);
        });

        const billsSample = await db.query(
            `SELECT * FROM bill_entries 
             WHERE supplier_id = $1 
             ORDER BY date DESC, item_name 
             LIMIT 10`,
            [vendor.rows[0].id]
        );
        console.log('\nLatest 10 bill entries:');
        billsSample.rows.forEach(row => {
            console.log(`  ${row.date} - ${row.item_name}: Qty=${row.qty}, Rate=${row.vendor_rate}`);
        });

        const billsDateRange = await db.query(
            `SELECT MIN(date) as min_date, MAX(date) as max_date 
             FROM bill_entries 
             WHERE supplier_id = $1`,
            [vendor.rows[0].id]
        );
        console.log(`\nBill entries date range: ${billsDateRange.rows[0].min_date} to ${billsDateRange.rows[0].max_date}`);

        console.log('\n✓ Verification complete!');
        process.exit(0);
    } catch (error) {
        console.error('Error during verification:', error);
        process.exit(1);
    }
}

verifyImport();
