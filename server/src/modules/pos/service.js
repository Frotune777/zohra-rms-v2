const db = require('../../config/db');
const InventoryService = require('../inventory/service');

class PosService {
    async getMenu() {
        const result = await db.query('SELECT * FROM menu_items ORDER BY category');
        return result.rows;
    }

    async addMenuItem(data) {
        const { name, price, category } = data;
        const result = await db.query(
            'INSERT INTO menu_items (name, price, category) VALUES ($1, $2, $3) RETURNING *',
            [name, parseFloat(price), category]
        );
        return result.rows[0];
    }

    async deleteMenuItem(id) {
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('DELETE FROM recipe_ingredients WHERE menu_item_id = $1', [id]);
            const result = await client.query('DELETE FROM menu_items WHERE id = $1 RETURNING *', [id]);
            if (result.rowCount === 0) throw new Error('Menu item not found');
            await client.query('COMMIT');
            return result.rows[0];
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    async createOrder(data, userId) {
        const { items, paymentMethod, customerName, customerPhone, notes } = data; // Added new fields

        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            let totalRevenue = 0;
            let totalCOGS = 0;

            // 1. Create POS Transaction
            // Calculate total first
            for (const item of items) {
                totalRevenue += item.price * item.qty;
            }

            const transRes = await client.query(
                `INSERT INTO pos_transactions (
                    total_amount, payment_method, status, customer_name, customer_phone, notes, created_by_user_id
                ) VALUES ($1, $2, 'COMPLETED', $3, $4, $5, $6) RETURNING id`,
                [totalRevenue, paymentMethod || 'CASH', customerName, customerPhone, notes, userId]
            );
            const transId = transRes.rows[0].id;

            // 2. Process Items & Inventory
            for (const item of items) {
                // Add to transaction items
                await client.query(
                    `INSERT INTO pos_transaction_items (transaction_id, menu_item_id, quantity, unit_price, total_price)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [transId, item.id, item.qty, item.price, item.price * item.qty]
                );

                // Inventory Deduction (Recipe based)
                const recipeRes = await client.query(
                    `SELECT r.inventory_item_id, r.quantity_required, i.unit_cost 
                     FROM recipe_ingredients r
                     JOIN inventory_items i ON r.inventory_item_id = i.id
                     WHERE r.menu_item_id = $1`, [item.id]
                );

                for (const ing of recipeRes.rows) {
                    const qtyUsed = ing.quantity_required * item.qty;
                    totalCOGS += qtyUsed * ing.unit_cost;

                    // Use InventoryService logic (but inside this transaction?)
                    // InventoryService.adjustStock creates its own transaction if client not passed.
                    // So I need to pass client to it.
                    await InventoryService.adjustStock(
                        ing.inventory_item_id,
                        -qtyUsed,
                        'SALE',
                        `POS Sale #${transId} - ${item.name}`,
                        userId,
                        client
                    );
                }
            }

            // 3. Financial Posting (Journal Entries)
            // Note: In a fully decoupled system, this might be an event. Here we do it inline.
            const jeRes = await client.query("INSERT INTO journal_entries (description) VALUES ($1) RETURNING id", [`POS Sale #${transId}`]);
            const jeId = jeRes.rows[0].id;

            // Ledger: Debit Cash/Bank (depending on method), Credit Revenue
            // Assuming 1000 is Cash. If Card/UPI, might be different.
            // For now, simplify to Cash (1000) as per original controller.
            // Future: Select account based on paymentMethod.
            const debitAccount = 1000;

            await client.query("INSERT INTO ledger_lines (journal_entry_id, account_code, debit) VALUES ($1, $2, $3)", [jeId, debitAccount, totalRevenue]);
            await client.query("INSERT INTO ledger_lines (journal_entry_id, account_code, credit) VALUES ($1, 4000, $2)", [jeId, 4000, totalRevenue]);

            // COGS: Debit COGS (5000), Credit Inventory (1200)
            if (totalCOGS > 0) {
                await client.query("INSERT INTO ledger_lines (journal_entry_id, account_code, debit) VALUES ($1, 5000, $2)", [jeId, 5000, totalCOGS]);
                await client.query("INSERT INTO ledger_lines (journal_entry_id, account_code, credit) VALUES ($1, 1200, $2)", [jeId, 1200, totalCOGS]);
            }

            await client.query('COMMIT');
            return { success: true, transactionId: transId };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }
}

module.exports = new PosService();
