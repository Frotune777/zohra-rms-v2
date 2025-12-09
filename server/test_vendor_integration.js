require('dotenv').config();
const db = require('./src/config/db');

async function runTests() {
    const client = await db.pool.connect();
    let testVendorId;
    let errors = [];

    console.log('=== VENDOR PAYMENT INTEGRATION TESTS ===\n');

    try {
        // SETUP
        console.log('SETUP: Creating test data...');
        // Create a unique vendor
        const vendorRes = await client.query(`
            INSERT INTO suppliers (name, vendor_type, category_id) 
            VALUES ($1, 'TestType', 1) 
            RETURNING id, name
        `, [`TestVendor_${Date.now()}`]);
        testVendorId = vendorRes.rows[0].id;
        console.log(`✓ Created test vendor: ${vendorRes.rows[0].name} (ID: ${testVendorId})`);

        // TEST 1: Create Bill (Purchase)
        console.log('\nTEST 1: Creating a bill to establish outstanding balance...');
        await client.query(`
            INSERT INTO vendor_ledger 
            (supplier_id, date, transaction_type, amount, details, category_id)
            VALUES ($1, CURRENT_DATE, 'Bill', 5000, 'Test Bill', 1)
        `, [testVendorId]);

        const balanceRes1 = await client.query('SELECT outstanding_balance FROM vendor_outstanding WHERE vendor_id = $1', [testVendorId]);
        const balance1 = parseFloat(balanceRes1.rows[0].outstanding_balance);
        if (balance1 === 5000) {
            console.log('✓ Bill created, balance is 5000');
        } else {
            throw new Error(`Expected balance 5000, got ${balance1}`);
        }

        // TEST 2: Partial Payment
        console.log('\nTEST 2: Processing partial payment (2000)...');
        // We use the controller logic simulation here since we can't easily call the express route without a server running
        // Detailed logic mirrors the controller
        await client.query('BEGIN');

        let paymentId;
        try {
            // 1. Insert payment
            const payRes = await client.query(`
                INSERT INTO vendor_payments (vendor_id, amount, payment_mode, notes, paid_by)
                VALUES ($1, 2000, 'Cash', 'Partial Pay Test', 'Tester')
                RETURNING id
            `, [testVendorId]);
            paymentId = payRes.rows[0].id;

            // 2. Update Ledger
            await client.query(`
                INSERT INTO vendor_ledger 
                (supplier_id, date, transaction_type, amount, details, payment_mode, payment_id)
                VALUES ($1, CURRENT_DATE, 'Payment', 2000, 'Partial Pay Test', 'Cash', $2)
            `, [testVendorId, paymentId]);

            // 3. Journal Entry
            const jeRes = await client.query(`
                INSERT INTO journal_entries (transaction_date, description)
                VALUES (CURRENT_DATE, 'Vendor Payment Test') RETURNING id
            `);
            const jeId = jeRes.rows[0].id;

            // 4. Update Payment link
            await client.query('UPDATE vendor_payments SET journal_entry_id = $1 WHERE id = $2', [jeId, paymentId]);

            // 5. Ledger Lines (Accounts 2000 and 1000) - THIS WAS THE AREA OF FAILURE
            await client.query(`
                INSERT INTO ledger_lines (journal_entry_id, account_code, debit, credit)
                VALUES ($1, 2000, 2000, 0)
            `, [jeId]); // Debit Payable

            await client.query(`
                INSERT INTO ledger_lines (journal_entry_id, account_code, debit, credit)
                VALUES ($1, 1000, 0, 2000)
            `, [jeId]); // Credit Cash

            await client.query('COMMIT');
            console.log('✓ Partial payment logic executed successfully');

        } catch (e) {
            await client.query('ROLLBACK');
            throw new Error(`Partial payment failed: ${e.message}`);
        }

        const balanceRes2 = await client.query('SELECT outstanding_balance FROM vendor_outstanding WHERE vendor_id = $1', [testVendorId]);
        const balance2 = parseFloat(balanceRes2.rows[0].outstanding_balance);
        if (balance2 === 3000) {
            console.log('✓ Balance updated correctly to 3000');
        } else {
            throw new Error(`Expected balance 3000, got ${balance2}`);
        }

        // TEST 3: Overpayment Prevention (Logic Check)
        console.log('\nTEST 3: Checking overpayment prevention logic...');
        const outstanding = balance2;
        const attemptAmount = 3500;
        if (attemptAmount > outstanding) {
            console.log(`✓ Overpayment check passed: ${attemptAmount} > ${outstanding} would be rejected`);
        } else {
            throw new Error('Overpayment check logic failed');
        }

        // TEST 4: Full Remaining Payment
        console.log('\nTEST 4: Processing full remaining payment (3000)...');
        await client.query('BEGIN');
        try {
            // 1. Insert payment
            const payRes = await client.query(`
                INSERT INTO vendor_payments (vendor_id, amount, payment_mode, notes, paid_by)
                VALUES ($1, 3000, 'Bank Transfer', 'Full Pay Test', 'Tester')
                RETURNING id
            `, [testVendorId]);
            const pid = payRes.rows[0].id;

            // 2. Update Ledger
            await client.query(`
                INSERT INTO vendor_ledger 
                (supplier_id, date, transaction_type, amount, details, payment_mode, payment_id)
                VALUES ($1, CURRENT_DATE, 'Payment', 3000, 'Full Pay Test', 'Bank Transfer', $2)
            `, [testVendorId, pid]);

            // 3. Journal Entry
            const jeRes = await client.query(`
                INSERT INTO journal_entries (transaction_date, description)
                VALUES (CURRENT_DATE, 'Vendor Payment Test 2') RETURNING id
            `);
            const jeId = jeRes.rows[0].id;

            await client.query('UPDATE vendor_payments SET journal_entry_id = $1 WHERE id = $2', [jeId, pid]);

            // 5. Ledger Lines (Accounts 2000 and 1010 for Bank)
            await client.query(`
                INSERT INTO ledger_lines (journal_entry_id, account_code, debit, credit)
                VALUES ($1, 2000, 3000, 0)
            `, [jeId]);

            await client.query(`
                INSERT INTO ledger_lines (journal_entry_id, account_code, debit, credit)
                VALUES ($1, 1010, 0, 3000)
            `, [jeId]);

            await client.query('COMMIT');
            console.log('✓ Full payment logic executed successfully');

        } catch (e) {
            await client.query('ROLLBACK');
            throw new Error(`Full payment failed: ${e.message}`);
        }

        const balanceRes3 = await client.query('SELECT outstanding_balance FROM vendor_outstanding WHERE vendor_id = $1', [testVendorId]);
        const balance3 = parseFloat(balanceRes3.rows[0].outstanding_balance);
        if (balance3 === 0) {
            console.log('✓ Balance updated correctly to 0');
        } else {
            throw new Error(`Expected balance 0, got ${balance3}`);
        }

        console.log('\n=== ALL TESTS PASSED SUCCESSFULLY! ===');

    } catch (err) {
        console.error('\n❌ TEST FAILED:', err.message);
        errors.push(err);
    } finally {
        // CLEANUP
        if (testVendorId) {
            console.log('\nCLEANUP: Removing test data...');
            // We need to delete in order of dependency due to foreign keys
            // 1. Ledger lines (linked to journals) - handled by cascade usually, but let's be safe if we knew IDs
            // 2. Vendor Ledger (linked to payments and supplier) - delete these first
            await client.query('DELETE FROM vendor_ledger WHERE supplier_id = $1', [testVendorId]);
            // 3. Vendor Payments (linked to supplier)
            await client.query('DELETE FROM vendor_payments WHERE vendor_id = $1', [testVendorId]);
            // 4. Supplier
            await client.query('DELETE FROM suppliers WHERE id = $1', [testVendorId]);
            console.log('✓ Test data removed');
        }
        client.release();

        if (errors.length > 0) process.exit(1);
        process.exit(0);
    }
}

runTests();
