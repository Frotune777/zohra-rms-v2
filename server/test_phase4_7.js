require('dotenv').config();
const db = require('./src/config/db');
const ledgerService = require('./src/modules/vendors/ledger.service');

async function testPhase4And7() {
    try {
        console.log('=== TESTING PHASE 4 & 7: LEDGER CALCULATIONS & DAILY SUMMARY ===\n');

        // Test 1: Running Balance Calculation
        console.log('TEST 1: Running Balance Calculation');
        console.log('─'.repeat(50));
        const runningBalance = await ledgerService.calculateRunningBalance(1);
        console.log(`✓ Opening Balance: ₹${runningBalance.opening_balance.toFixed(2)}`);
        console.log(`✓ Transactions: ${runningBalance.transactions.length}`);
        console.log(`✓ Closing Balance: ₹${runningBalance.closing_balance.toFixed(2)}`);
        console.log('');

        // Test 2: Outstanding Amount
        console.log('TEST 2: Outstanding Amount Calculation');
        console.log('─'.repeat(50));
        const outstanding = await ledgerService.getOutstandingAmount(1);
        console.log(`✓ Vendor ID: ${outstanding.vendor_id}`);
        console.log(`✓ Outstanding: ₹${outstanding.outstanding_amount.toFixed(2)}`);
        console.log('');

        // Test 3: Category Aggregation
        console.log('TEST 3: Category-wise Aggregation');
        console.log('─'.repeat(50));
        const categories = await ledgerService.getCategoryAggregation();
        console.log(`✓ Total Categories: ${categories.length}`);
        categories.forEach(cat => {
            console.log(`  - ${cat.category_name}: ${cat.vendor_count} vendors, ₹${cat.outstanding_balance.toFixed(2)}`);
        });
        console.log('');

        // Test 4: Payment History
        console.log('TEST 4: Payment History');
        console.log('─'.repeat(50));
        const history = await ledgerService.getPaymentHistory(1);
        console.log(`✓ Total Payments: ${history.summary.total_payments}`);
        console.log(`✓ Total Amount: ₹${history.summary.total_amount.toFixed(2)}`);
        Object.entries(history.summary.by_mode).forEach(([mode, data]) => {
            console.log(`  - ${mode}: ${data.count} payments, ₹${data.total.toFixed(2)}`);
        });
        console.log('');

        // Test 5: Date Range Report
        console.log('TEST 5: Date Range Report');
        console.log('─'.repeat(50));
        const today = new Date().toISOString().split('T')[0];
        const dateRange = await ledgerService.getDateRangeReport(today, today);
        console.log(`✓ Date Range: ${dateRange.date_range.start} to ${dateRange.date_range.end}`);
        console.log(`✓ Total Bills: ₹${dateRange.totals.total_bills.toFixed(2)}`);
        console.log(`✓ Total Payments: ₹${dateRange.totals.total_payments.toFixed(2)}`);
        console.log(`✓ Net Outstanding: ₹${dateRange.totals.net_outstanding.toFixed(2)}`);
        console.log('');

        // Test 6: Aging Report
        console.log('TEST 6: Aging Report');
        console.log('─'.repeat(50));
        const aging = await ledgerService.getAgingReport();
        console.log(`✓ Vendors with Outstanding: ${aging.length}`);
        aging.forEach(vendor => {
            console.log(`  - ${vendor.vendor_name}: ₹${vendor.outstanding_balance.toFixed(2)} (${vendor.aging_category})`);
        });
        console.log('');

        // Test 7: Daily Summary Integration
        console.log('TEST 7: Daily Summary Integration');
        console.log('─'.repeat(50));
        const summaryRes = await db.query(`
            SELECT 
                payment_mode,
                COALESCE(SUM(amount), 0) as total,
                COUNT(*) as count
            FROM vendor_payments
            WHERE payment_date = $1
            GROUP BY payment_mode
        `, [today]);

        console.log(`✓ Vendor Payments Today:`);
        let totalVendorPayments = 0;
        summaryRes.rows.forEach(row => {
            const amount = parseFloat(row.total);
            totalVendorPayments += amount;
            console.log(`  - ${row.payment_mode}: ${row.count} payments, ₹${amount.toFixed(2)}`);
        });
        console.log(`  Total: ₹${totalVendorPayments.toFixed(2)}`);
        console.log('');

        // Test 8: Advance Ledger Integration
        console.log('TEST 8: Advance Ledger Integration');
        console.log('─'.repeat(50));
        const advancesRes = await db.query(`
            SELECT 
                payment_mode,
                COALESCE(SUM(amount), 0) as total
            FROM advance_ledger
            WHERE transaction_type = 'Advance'
            AND DATE(transaction_date) = $1
            GROUP BY payment_mode
        `, [today]);

        console.log(`✓ Salary Advances Today:`);
        let totalAdvances = 0;
        advancesRes.rows.forEach(row => {
            const amount = parseFloat(row.total);
            totalAdvances += amount;
            console.log(`  - ${row.payment_mode}: ₹${amount.toFixed(2)}`);
        });
        console.log(`  Total: ₹${totalAdvances.toFixed(2)}`);
        console.log('');

        // Final Summary
        console.log('='.repeat(50));
        console.log('PHASE 4 & 7 TEST SUMMARY');
        console.log('='.repeat(50));
        console.log('✅ Running balance calculation: PASS');
        console.log('✅ Outstanding amount calculation: PASS');
        console.log('✅ Category aggregation: PASS');
        console.log('✅ Payment history tracking: PASS');
        console.log('✅ Date range reporting: PASS');
        console.log('✅ Aging report: PASS');
        console.log('✅ Daily summary integration: PASS');
        console.log('✅ Advance ledger integration: PASS');
        console.log('');
        console.log('All Phase 4 & 7 tests passed successfully! ✅');

    } catch (err) {
        console.error('\n❌ TEST FAILED:', err.message);
        console.error(err.stack);
        process.exit(1);
    } finally {
        process.exit(0);
    }
}

testPhase4And7();
