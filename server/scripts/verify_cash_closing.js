const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const transactionService = require('../src/modules/finance/TransactionService');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function verifyCashClosing() {
    try {
        console.log('--- Starting Cash Closing Verification ---');

        // 1. Mock Data from Frontend
        const cashClosingData = {
            date: new Date().toISOString().split('T')[0],
            type: 'Sales',
            amount: 1500, // 2x500 + 5x100
            payment_method: 'Cash',
            status: 'Paid',
            description: 'Cash Closing (Counter)',
            metadata: {
                denominations: {
                    500: '2',
                    100: '5'
                }
            }
        };

        // 2. Create Transaction
        console.log('Creating Cash Closing Transaction...');
        const txn = await transactionService.createTransaction(cashClosingData);
        console.log(`Created Transaction ID: ${txn.id}`);

        // 3. Verify Database
        console.log('Verifying Database Record...');
        const res = await pool.query('SELECT * FROM transactions WHERE id = $1', [txn.id]);
        const dbTxn = res.rows[0];

        if (dbTxn.amount == 1500) {
            console.log('   [PASS] Amount matches (1500).');
        } else {
            console.error(`   [FAIL] Amount mismatch: ${dbTxn.amount}`);
        }

        if (dbTxn.metadata && dbTxn.metadata.denominations && dbTxn.metadata.denominations['500'] === '2') {
            console.log('   [PASS] Metadata denominations saved correctly.');
        } else {
            console.error('   [FAIL] Metadata denominations NOT saved correctly.');
            console.log('Metadata:', dbTxn.metadata);
        }

        // Cleanup
        console.log('Cleaning up...');
        await transactionService.deleteTransaction(txn.id);

        console.log('--- Verification Complete ---');

    } catch (err) {
        console.error('Error:', err);
    } finally {
        await pool.end();
    }
}

verifyCashClosing();
