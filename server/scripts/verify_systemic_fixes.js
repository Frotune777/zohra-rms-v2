require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://admin:password@localhost:5432/alzohra_db',
});

async function verifySystemicFixes() {
    const client = await pool.connect();
    try {
        console.log('--- Verifying Phase 6-8 Fixes ---');

        // 1. Audit Trail Verification
        console.log('\n[Audit Trail]');
        // Update a menu item and check audit log
        const itemRes = await client.query("INSERT INTO menu_items (name, price, category) VALUES ('Audit Test Item', 100, 'Test') RETURNING id");
        const itemId = itemRes.rows[0].id;

        await client.query("UPDATE menu_items SET price = 150 WHERE id = $1", [itemId]);
        const auditLog = await client.query("SELECT * FROM audit_logs WHERE record_id = $1 AND table_name = 'menu_items'", [String(itemId)]);
        console.log(`Log Count: ${auditLog.rows.length}`);
        if (auditLog.rows.length >= 2) console.log('✅ Audit Logged (Insert + Update)');
        else console.error('❌ Audit Failed');

        // Cleanup
        await client.query("DELETE FROM menu_items WHERE id = $1", [itemId]);


        // 2. Financial Period Verification
        console.log('\n[Financial Periods]');
        // Create closed period
        await client.query("INSERT INTO financial_periods (name, start_date, end_date, status) VALUES ('Test Closed Period', '2020-01-01', '2020-01-31', 'Closed')");

        try {
            // Try to insert journal entry in closed period
            await client.query("INSERT INTO journal_entries (description, transaction_date) VALUES ('Backdated Entry', '2020-01-15')");
            console.error('❌ Failed: Allowed insert in closed period!');
        } catch (e) {
            if (e.message.includes('Closed') || e.message.includes('closed')) {
                console.log('✅ Success: Blocked insert in closed period.');
            } else {
                console.error('❌ Error but not period related:', e.message);
            }
        }

        // Cleanup
        await client.query("DELETE FROM financial_periods WHERE name = 'Test Closed Period'");


        // 3. Report Reconciliation Verification
        console.log('\n[Reports]');
        // Check if getDailyStats logic works (Query test)
        const dailyStatsQuery = `
          SELECT payment_method, COUNT(*) as count, SUM(amount) as total 
          FROM payment_transactions 
          WHERE DATE(transaction_date) = CURRENT_DATE 
          GROUP BY payment_method`;
        const stats = await client.query(dailyStatsQuery);
        console.log('Daily Stats (Direct Query):', stats.rows.length > 0 ? stats.rows : 'No transactions today (Expected if none created)');

        // Check Payroll Components Query
        const payQuery = `SELECT component_name, SUM(amount) FROM salary_history_components GROUP BY component_name`;
        const payRes = await client.query(payQuery);
        console.log('Payroll Components (Direct Query):', payRes.rows.length > 0 ? '✅ Data Found' : '⚠️ No Data (Run payroll test first)');

    } catch (err) {
        console.error('Verification Failed:', err);
    } finally {
        client.release();
        pool.end();
    }
}

verifySystemicFixes();
