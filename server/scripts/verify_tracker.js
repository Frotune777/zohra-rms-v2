const path = require('path');
const { Pool } = require('pg');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const API_URL = 'http://localhost:5000/api/finance';
// Mock token or bypass auth if possible, but we likely need a token.
// For this test script, assuming we can use a direct DB check or simulate being logged in if we had a token.
// Since getting a token via script is annoying (requires login), we will mostly test the Service classes directly via node script connecting to DB, 
// OR use supertest if available. 
// Let's use direct Service testing to avoid Auth middleware issues in this quick check, effectively Unit/Integration testing the modules.

const TransactionService = require('../src/modules/finance/TransactionService');
const FinancialCalculator = require('../src/modules/finance/FinancialCalculator');

async function test() {
    console.log('🚀 Starting Verification...');

    const date = new Date().toISOString().split('T')[0];
    const testData1 = {
        date,
        type: 'Sales',
        amount: 1000.00,
        payment_method: 'Cash',
        status: 'Paid',
        description: 'Test Sale 1'
    };

    const testData2 = {
        date,
        type: 'Expense',
        amount: 300.50,
        payment_method: 'Bank',
        status: 'Paid',
        description: 'Test Expense 1'
    };

    try {
        // 1. Create Transactions
        console.log('1. Creating Transactions...');
        const t1 = await TransactionService.createTransaction(testData1);
        console.log('   Created:', t1.description, t1.amount);
        const t2 = await TransactionService.createTransaction(testData2);
        console.log('   Created:', t2.description, t2.amount);

        // 2. Fetch Transactions
        console.log('2. Fetching Transactions...');
        const txs = await TransactionService.getTransactions({ date });
        const myTxs = txs.filter(t => t.id === t1.id || t.id === t2.id);
        if (myTxs.length === 2) console.log('   ✓ Retrieved both transactions');
        else console.error('   ✗ Failed to retrieve transactions');

        // 3. Check Summary
        console.log('3. Checking Daily Summary...');
        const summary = await FinancialCalculator.calculateDailySummary(date);

        console.log('   Summary:', JSON.stringify(summary, null, 2));

        const expectedSales = 1000.00;
        const expectedExpenses = 300.50;

        if (summary.totalSales >= expectedSales && summary.totalExpenses >= expectedExpenses) {
            console.log('   ✓ Totals match expected values (allowing for other data)');
        } else {
            console.error('   ✗ Totals mismatch');
        }

        // 4. Cleanup
        console.log('4. Cleaning up...');
        await TransactionService.deleteTransaction(t1.id);
        await TransactionService.deleteTransaction(t2.id);
        console.log('   ✓ Cleanup complete');

    } catch (err) {
        console.error('Test Failed:', err);
    } finally {
        process.exit(0);
    }
}

test();
