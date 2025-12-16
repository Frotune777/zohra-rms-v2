require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const { Pool } = require('pg');
const PosService = require('../src/modules/pos/service');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://admin:password@localhost:5432/alzohra_db',
});

// Mock DB pool connect for service usage? 
// No, the service requires `db` module. Since we are running this script in context where `../../config/db` is required by Service, 
// we rely on the app's db config.

// We need to fetch a valid menu item first to order it.
async function verifyFlow() {
    const client = await pool.connect();
    try {
        console.log('Starting P0 Verification Flow...');

        // 1. Get a menu item with recipe (or just any item)
        const itemRes = await client.query('SELECT * FROM menu_items LIMIT 1');
        if (itemRes.rows.length === 0) throw new Error('No menu items found');
        const item = itemRes.rows[0];

        console.log(`Test Item: ${item.name} (${item.id}) - Price: ${item.price}`);

        // 2. Create Order via Service
        const orderData = {
            items: [{ id: item.id, qty: 2, price: item.price, name: item.name }],
            paymentMethod: 'Cash',
            customerName: 'Test Customer',
            customerPhone: '9876543210'
        };

        console.log('Creating Order...');
        const result = await PosService.createOrder(orderData, 1); // User ID 1 (Admin)
        console.log('Order Result:', result);

        if (!result.success || !result.orderId) throw new Error('Order creation failed');

        // 3. Verify Database State

        // A. Orders Table
        const orderCheck = await client.query('SELECT * FROM orders WHERE id = $1', [result.orderId]);
        console.log('A. Order Record:', orderCheck.rows[0] ? '✅ Found' : '❌ Missing');

        // B. Payment Transactions (P0)
        const payCheck = await client.query('SELECT * FROM payment_transactions WHERE order_id = $1', [result.orderId]);
        console.log('B. Payment Transaction:', payCheck.rows[0] ? '✅ Found' : '❌ Missing', payCheck.rows[0]);

        // C. Journal Entries (P0)
        const jeCheck = await client.query("SELECT * FROM journal_entries WHERE description = $1", [`POS Order #${result.orderId}`]);
        console.log('C. Financial Journal:', jeCheck.rows[0] ? '✅ Found' : '❌ Missing');
        if (jeCheck.rows.length > 0) {
            const lines = await client.query('SELECT * FROM ledger_lines WHERE journal_entry_id = $1', [jeCheck.rows[0].id]);
            console.log('   Ledger Lines:', lines.rows.length);
        }

        // D. Inventory Deduction (P0)
        // We check inventory_transactions
        const invTxCheck = await client.query("SELECT * FROM inventory_transactions WHERE reference_id = $1 AND reference_type = 'Order'", [String(result.orderId)]);
        console.log('D. Inventory Transactions:', invTxCheck.rows.length > 0 ? `✅ Found (${invTxCheck.rows.length})` : '⚠️ No Inventory Transactions (Item might not have recipe)');

        console.log('Verification Complete.');

    } catch (err) {
        console.error('Verification Failed:', err);
    } finally {
        client.release();
        pool.end();
        // Force exit as db pool might hang
        process.exit(0);
    }
}

verifyFlow();
