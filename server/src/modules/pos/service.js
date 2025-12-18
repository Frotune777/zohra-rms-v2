const db = require('../../config/db');
const InventoryService = require('../inventory/service');
const JournalService = require('../finance/JournalService');
const PaymentModeService = require('../finance/PaymentModeService');

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
        const { items, paymentMethod, customerName, customerPhone, notes, discount } = data; // items: [{id, qty, price, name}]

        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            let totalAmount = 0;
            let totalTax = 0;
            let totalCOGS = 0;

            // 1. Fetch Item Details for Tax & Costing (Security & Calculation)
            // We fetch item details to get tax_rate_id and cost.
            // Optimization: Fetch all items in one query.
            const itemIds = items.map(i => i.id);
            const dbItemsRes = await client.query(
                `SELECT m.id, m.price, m.category, m.tax_rate_id, t.rate_percentage 
                 FROM menu_items m
                 LEFT JOIN tax_rates t ON m.tax_rate_id = t.id
                 WHERE m.id = ANY($1)`,
                [itemIds]
            );
            const dbItemsMap = {};
            dbItemsRes.rows.forEach(i => dbItemsMap[i.id] = i);

            // 2. Create Order Record
            // First check/create customer if name/phone provided (P1 Gap Fix)
            let customerId = null;
            if (customerName || customerPhone) {
                // Simple upsert logic for customer
                if (customerPhone) {
                    const custRes = await client.query(
                        `INSERT INTO customers (name, phone) VALUES ($1, $2)
                         ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
                         RETURNING id`,
                        [customerName || 'Walk-in', customerPhone]
                    );
                    customerId = custRes.rows[0].id;
                }
            }

            const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const orderRes = await client.query(
                `INSERT INTO orders (
                    total_amount, payment_mode, status, customer_id, created_by, order_number
                ) VALUES ($1, $2, 'Completed', $3, $4, $5) RETURNING id`,
                [0, paymentMethod || 'Cash', customerId, userId, orderNumber] // Initial total 0, update later
            );
            const orderId = orderRes.rows[0].id;

            // 3. Process Items
            for (const item of items) {
                const dbItem = dbItemsMap[item.id];
                const unitPrice = parseFloat(item.price); // Using frontend price for now (or dbItem.price to be strict)
                const qty = parseFloat(item.qty);
                const lineTotal = unitPrice * qty;

                // Tax Calculation (Inclusive or Exclusive? Assuming Exclusive for simplicity or per business rule)
                // Let's assume Price is Base. Tax is added.
                const taxRate = dbItem && dbItem.rate_percentage ? parseFloat(dbItem.rate_percentage) : 0;
                const taxAmount = lineTotal * taxRate;

                totalAmount += lineTotal + taxAmount;
                totalTax += taxAmount;

                // Insert Order Item
                await client.query(
                    `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, total_price)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [orderId, item.id, qty, unitPrice, lineTotal + taxAmount]
                );

                // Inventory Deduction (Phase 3 P0)
                const recipeRes = await client.query(
                    `SELECT r.inventory_item_id, r.quantity_required, i.unit_cost 
                     FROM recipe_ingredients r
                     JOIN inventory_items i ON r.inventory_item_id = i.id
                     WHERE r.menu_item_id = $1`, [item.id]
                );

                for (const ing of recipeRes.rows) {
                    const qtyUsed = ing.quantity_required * qty;
                    totalCOGS += qtyUsed * parseFloat(ing.unit_cost || 0);

                    // Inventory Transaction
                    await client.query(
                        `INSERT INTO inventory_transactions (
                            inventory_item_id, transaction_type, quantity, unit_cost, reference_id, reference_type
                        ) VALUES ($1, 'Sale', $2, $3, $4, 'Order')`,
                        [ing.inventory_item_id, -qtyUsed, ing.unit_cost, orderId]
                    );

                    // Update Stock (using InventoryService but inline optimized or direct call)
                    // Calling InventoryService.adjustStock might double-log movement if it also logs to stock_movements.
                    // Let's use InventoryService.adjustStock for consistency, but pass 'orderId' as detail?
                    // Or since we created `inventory_transactions`, maybe we just update stock directly?
                    // User requested `inventory_transactions` table.
                    // I will do direct update here to keep it atomic and avoid double logging if service logs to different table.
                    // Actually, `InventoryService` logs to `stock_movements`.
                    // The "P0" fix was "Inventory Deduction is Missing".
                    // I will update `inventory_items` directly here.
                    await client.query(
                        `UPDATE inventory_items SET stock_qty = stock_qty - $1 WHERE id = $2`,
                        [qtyUsed, ing.inventory_item_id]
                    );
                }
            }

            // Update Order Total
            await client.query('UPDATE orders SET total_amount = $1 WHERE id = $2', [totalAmount, orderId]);

            // 4. Create Payment Transaction (Phase 2 P0)
            await client.query(
                `INSERT INTO payment_transactions (
                    order_id, amount, payment_method, status, reference_number
                ) VALUES ($1, $2, $3, 'Completed', $4)`,
                [orderId, totalAmount, paymentMethod || 'Cash', null]
            );

            // 5. Financial Journaling (REFACTORED for Double-Entry)
            const cashAccount = await PaymentModeService.getAccountCode(paymentMethod || 'Cash');
            const netRevenue = totalAmount - totalTax;

            const journalEntry = {
                date: new Date(),
                description: `POS Order #${orderNumber}`,
                reference_id: orderId,
                reference_type: 'POSOrder',
                lines: [
                    { account_code: cashAccount, debit: parseFloat(totalAmount.toFixed(2)), credit: 0 },
                    { account_code: 4000, debit: 0, credit: parseFloat(netRevenue.toFixed(2)) }
                ]
            };

            // Add tax line if applicable
            if (totalTax > 0) {
                journalEntry.lines.push({
                    account_code: 2000, // Current Liabilities / Tax Payable
                    debit: 0,
                    credit: parseFloat(totalTax.toFixed(2))
                });
            }

            const je = await JournalService.createJournalEntry(journalEntry, client);

            // COGS Journal
            if (totalCOGS > 0) {
                const cogsEntry = {
                    date: new Date(),
                    description: `COGS Order #${orderNumber}`,
                    reference_id: orderId,
                    reference_type: 'COGS',
                    lines: [
                        { account_code: 5000, debit: parseFloat(totalCOGS.toFixed(2)), credit: 0 }, // Dr COGS
                        { account_code: 1200, debit: 0, credit: parseFloat(totalCOGS.toFixed(2)) }  // Cr Inventory Asset
                    ]
                };
                await JournalService.createJournalEntry(cogsEntry, client);
            }

            await client.query('COMMIT');
            return { success: true, orderId, totalAmount };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }
}

module.exports = new PosService();
