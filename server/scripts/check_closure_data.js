const db = require('../src/config/db');

async function checkData() {
    try {
        console.log('--- Payment Modes ---');
        const pmRes = await db.query('SELECT id, name, account_code, is_active FROM payment_modes');
        console.table(pmRes.rows);

        console.log('\n--- Chart of Accounts (Cash/Bank) ---');
        const coaRes = await db.query('SELECT code, name, type FROM chart_of_accounts WHERE code BETWEEN 1000 AND 1050');
        console.table(coaRes.rows);

        console.log('\n--- Users & Wallets ---');
        const userRes = await db.query('SELECT id, full_name, role, ledger_account_code FROM users LIMIT 10');
        console.table(userRes.rows);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkData();
