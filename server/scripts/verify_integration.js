const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const transactionService = require('../src/modules/finance/TransactionService');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function verifyIntegration() {
    const client = await pool.connect();
    try {
        console.log('--- Starting Vendor Integration Verification ---');

        // 1. Create Dummy Vendor
        console.log('1. Creating Dummy Vendor...');
        const vendorRes = await client.query(`
            INSERT INTO suppliers (name, vendor_type) 
            VALUES ('Integration Test Vendor', 'Vegetable') 
            RETURNING id
        `);
        const vendorId = vendorRes.rows[0].id;
        console.log(`   Created Vendor ID: ${vendorId}`);

        // 2. Create Pending Expense
        console.log('2. Creating Pending Expense...');
        const txn = await transactionService.createTransaction({
            date: new Date().toISOString().split('T')[0],
            type: 'Expense',
            amount: 500,
            payment_method: 'Cash',
            status: 'Pending',
            description: 'Integration Test Expense',
            vendor_id: vendorId
        });
        console.log(`   Created Transaction ID: ${txn.id}`);

        // 3. Verify Ledger for Bill
        console.log('3. Verifying Ledger for Bill...');
        const ledgerRes1 = await client.query(`
            SELECT * FROM vendor_ledger 
            WHERE supplier_id = $1 AND transaction_type = 'Bill' AND reference_number = $2
        `, [vendorId, `TRX-${txn.id}`]);

        if (ledgerRes1.rows.length === 1) {
            console.log('   [PASS] Bill record found in Vendor Ledger.');
        } else {
            console.error('   [FAIL] Bill record NOT found in Vendor Ledger.');
        }

        // 4. Update to Paid
        console.log('4. Updating Transaction to Paid...');
        await transactionService.updateTransaction(txn.id, {
            status: 'Paid',
            paid_by: 'Tester',
            paid_date: new Date().toISOString().split('T')[0]
        });

        // 5. Verify Ledger for Payment
        console.log('5. Verifying Ledger for Payment...');
        const ledgerRes2 = await client.query(`
            SELECT * FROM vendor_ledger 
            WHERE supplier_id = $1 AND transaction_type = 'Payment' AND reference_number = $2
        `, [vendorId, `TRX-${txn.id}`]);

        if (ledgerRes2.rows.length === 1) {
            console.log('   [PASS] Payment record found in Vendor Ledger.');
        } else {
            console.error('   [FAIL] Payment record NOT found in Vendor Ledger.');
        }

        // 6. Verify Vendor Payments Table
        console.log('6. Verifying Vendor Payments Table...');
        const paymentRes = await client.query(`
            SELECT * FROM vendor_payments 
            WHERE vendor_id = $1 AND reference_number = $2
        `, [vendorId, `TRX-${txn.id}`]);

        if (paymentRes.rows.length === 1) {
            console.log('   [PASS] Payment record found in Vendor Payments table.');
        } else {
            console.error('   [FAIL] Payment record NOT found in Vendor Payments table.');
        }

        // Cleanup
        console.log('7. Cleaning up...');
        await client.query('DELETE FROM suppliers WHERE id = $1', [vendorId]);
        await client.query('DELETE FROM transactions WHERE id = $1', [txn.id]);

        console.log('--- Verification Complete ---');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        client.release();
        await pool.end();
    }
}

// Mock pool query for TransactionService if needed, but here we require the actual service which imports the actual db.
// We need to make sure TransactionService uses the same pool or connection. 
// TransactionService imports '../../config/db', which uses process.env.DATABASE_URL.
// So it should work if env is loaded correctly.

verifyIntegration();
