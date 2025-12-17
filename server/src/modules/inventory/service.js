const db = require('../../config/db');

class InventoryService {
    // --- Helper Logic ---
    calculateExpectedRate(rawRates, rule) {
        if (!rawRates || !rule) return 0.0;

        const { tandoor_rate, boiler_rate, egg_rate } = rawRates;
        const { base_rate_type, op1, val1, op2, val2 } = rule;

        let rate = 0.0;
        if (base_rate_type === 'TandoorRate') rate = parseFloat(tandoor_rate);
        else if (base_rate_type === 'BoilerRate') rate = parseFloat(boiler_rate);
        else if (base_rate_type === 'EggRate') rate = parseFloat(egg_rate);

        const applyOp = (currentVal, op, operand) => {
            if (operand === null || operand === undefined) return currentVal;
            const val = parseFloat(operand);
            if (op === '+') return currentVal + val;
            if (op === '-') return currentVal - val;
            if (op === '*') return currentVal * val;
            if (op === '/') return val !== 0 ? currentVal / val : currentVal;
            return currentVal;
        };

        rate = applyOp(rate, op1, val1);
        if (op2 && val2 !== null) {
            rate = applyOp(rate, op2, val2);
        }

        return Math.max(0.0, parseFloat(rate.toFixed(2)));
    }

    // --- Core Inventory Operations ---

    async getAllItems() {
        const result = await db.query('SELECT * FROM inventory_items ORDER BY name');
        return result.rows;
    }

    async addItem(data, userId) {
        const { name, stock_qty, unit, unit_cost } = data;

        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            const result = await client.query(
                'INSERT INTO inventory_items (name, stock_qty, unit, unit_cost, created_by_user_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
                [name, parseFloat(stock_qty), unit, parseFloat(unit_cost), userId]
            );
            const newItem = result.rows[0];

            if (parseFloat(stock_qty) > 0) {
                await client.query(
                    `INSERT INTO stock_movements (inventory_item_id, movement_type, quantity_change, details, created_by_user_id)
                     VALUES ($1, 'ADJ_IN', $2, 'Initial Stock', $3)`,
                    [newItem.id, parseFloat(stock_qty), userId]
                );
            }

            await client.query('COMMIT');
            return newItem;
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    async updateItem(id, data, userId) {
        const { name, stock_qty, unit, unit_cost } = data;

        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            const currentRes = await client.query('SELECT stock_qty FROM inventory_items WHERE id = $1', [id]);
            if (currentRes.rowCount === 0) throw new Error('Item not found');

            const currentQty = parseFloat(currentRes.rows[0].stock_qty);
            const newQty = parseFloat(stock_qty);
            const diff = newQty - currentQty;

            const result = await client.query(
                'UPDATE inventory_items SET name = $1, stock_qty = $2, unit = $3, unit_cost = $4 WHERE id = $5 RETURNING *',
                [name, newQty, unit, parseFloat(unit_cost), id]
            );

            if (Math.abs(diff) > 0.001) {
                const type = diff > 0 ? 'ADJ_IN' : 'ADJ_OUT';
                await client.query(
                    `INSERT INTO stock_movements (inventory_item_id, movement_type, quantity_change, details, created_by_user_id)
                     VALUES ($1, $2, $3, 'Manual Adjustment', $4)`,
                    [id, type, Math.abs(diff), userId]
                );
            }

            await client.query('COMMIT');
            return result.rows[0];
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    async adjustStock(itemId, quantityChange, type, details, userId, client = null) {
        const shouldRelease = !client;
        if (shouldRelease) {
            client = await db.pool.connect();
            await client.query('BEGIN');
        }

        try {
            // Update inventory_items
            const op = quantityChange >= 0 ? '+' : '-';
            const absQty = Math.abs(quantityChange);

            const res = await client.query(
                `UPDATE inventory_items 
                 SET stock_qty = stock_qty ${op} $1, updated_at = NOW() 
                 WHERE id = $2 RETURNING *`,
                [absQty, itemId]
            );

            if (res.rowCount === 0) throw new Error(`Inventory item ${itemId} not found`);

            // Log movement
            await client.query(
                `INSERT INTO stock_movements (inventory_item_id, movement_type, quantity_change, details, created_by_user_id)
                 VALUES ($1, $2, $3, $4, $5)`,
                [itemId, type, absQty, details, userId]
            );

            if (shouldRelease) await client.query('COMMIT');
            return res.rows[0];
        } catch (e) {
            if (shouldRelease) await client.query('ROLLBACK');
            throw e;
        } finally {
            if (shouldRelease) client.release();
        }
    }

    async deleteItem(id) {
        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');
            // Delete recipe ingredients first
            await client.query('DELETE FROM recipe_ingredients WHERE inventory_item_id = $1', [id]);
            const result = await client.query('DELETE FROM inventory_items WHERE id = $1 RETURNING *', [id]);

            if (result.rowCount === 0) throw new Error('Item not found');

            await client.query('COMMIT');
            return result.rows[0];
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    // --- Daily Rates ---

    async getDailyRates(date) {
        const result = await db.query('SELECT * FROM daily_rates WHERE date = $1', [date]);
        return result.rows[0] || null;
    }

    async saveDailyRates(data) {
        const { date, tandoor_rate, boiler_rate, egg_rate } = data;

        // Determine status based on whether all rates are filled
        const hasAllRates = tandoor_rate > 0 && boiler_rate > 0 && egg_rate > 0;
        const status = hasAllRates ? 'confirmed' : 'pending';

        const result = await db.query(
            `INSERT INTO daily_rates (date, tandoor_rate, boiler_rate, egg_rate, status)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (date) DO UPDATE 
             SET tandoor_rate = EXCLUDED.tandoor_rate,
                 boiler_rate = EXCLUDED.boiler_rate,
                 egg_rate = EXCLUDED.egg_rate,
                 status = EXCLUDED.status
             RETURNING *`,
            [date, tandoor_rate, boiler_rate, egg_rate, status]
        );
        return result.rows[0];
    }

    async getRateStatus() {
        const result = await db.query('SELECT date FROM daily_rates ORDER BY date DESC LIMIT 10');
        return result.rows;
    }

    async getAllRatesCalendar(startDate, endDate) {
        // Get all dates with rates and their status within the date range
        const result = await db.query(
            `SELECT 
                TO_CHAR(date, 'YYYY-MM-DD') as date, 
                tandoor_rate, 
                boiler_rate, 
                egg_rate,
                COALESCE(status, 'pending') as status,
                updated_by
            FROM daily_rates 
            WHERE date >= $1 AND date <= $2
            ORDER BY date ASC`,
            [startDate, endDate]
        );
        return result.rows;
    }

    // --- Suppliers & Markup ---

    async getSuppliers() {
        const result = await db.query('SELECT * FROM suppliers ORDER BY name');
        return result.rows;
    }

    async createSupplier(data) {
        const { name, phone, payment_type, vendor_type, markup_required, contact_person, email, address, gstin } = data;
        const result = await db.query(
            `INSERT INTO suppliers (name, phone, payment_type, vendor_type, markup_required, contact_person, email, address, gstin)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [name, phone, payment_type, vendor_type, markup_required, contact_person, email, address, gstin]
        );
        return result.rows[0];
    }

    async updateSupplier(id, data) {
        const { name, phone, payment_type, vendor_type, markup_required, contact_person, email, address, gstin } = data;
        const result = await db.query(
            `UPDATE suppliers 
             SET name = $1, phone = $2, payment_type = $3, vendor_type = $4, markup_required = $5,
                 contact_person = $6, email = $7, address = $8, gstin = $9, updated_at = NOW()
             WHERE id = $10
             RETURNING *`,
            [name, phone, payment_type, vendor_type, markup_required, contact_person, email, address, gstin, id]
        );
        if (result.rowCount === 0) throw new Error('Supplier not found');
        return result.rows[0];
    }

    async getMarkupRules(supplierId) {
        const result = await db.query('SELECT * FROM markup_rules WHERE supplier_id = $1', [supplierId]);
        return result.rows;
    }

    async saveMarkupRule(data) {
        const { supplier_id, item_name, base_rate_type, op1, val1, op2, val2 } = data;
        const result = await db.query(
            `INSERT INTO markup_rules (supplier_id, item_name, base_rate_type, op1, val1, op2, val2)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (supplier_id, item_name) DO UPDATE
             SET base_rate_type = EXCLUDED.base_rate_type,
                 op1 = EXCLUDED.op1, val1 = EXCLUDED.val1,
                 op2 = EXCLUDED.op2, val2 = EXCLUDED.val2
             RETURNING *`,
            [supplier_id, item_name, base_rate_type, op1, val1, op2, val2]
        );
        return result.rows[0];
    }

    async updateMarkupRule(id, data) {
        const { item_name, base_rate_type, op1, val1, op2, val2 } = data;
        const result = await db.query(
            `UPDATE markup_rules 
             SET item_name = $1, base_rate_type = $2, op1 = $3, val1 = $4, op2 = $5, val2 = $6, updated_at = NOW()
             WHERE id = $7
             RETURNING *`,
            [item_name, base_rate_type, op1, val1, op2 || null, val2 || null, id]
        );
        if (result.rowCount === 0) throw new Error('Markup rule not found');
        return result.rows[0];
    }

    async deleteMarkupRule(id) {
        const result = await db.query('DELETE FROM markup_rules WHERE id = $1 RETURNING *', [id]);
        if (result.rowCount === 0) throw new Error('Markup rule not found');
        return result.rows[0];
    }

    // --- Bill Entries ---

    async createBillEntry(data, userId) {
        const { date, supplier_id, item_name, qty, vendor_rate } = data;

        const client = await db.pool.connect();
        try {
            await client.query('BEGIN');

            const ratesRes = await client.query('SELECT * FROM daily_rates WHERE date = $1', [date]);
            if (ratesRes.rows.length === 0) throw new Error('Daily rates not set for this date');
            const rawRates = ratesRes.rows[0];

            const ruleRes = await client.query(
                'SELECT * FROM markup_rules WHERE supplier_id = $1 AND item_name = $2',
                [supplier_id, item_name]
            );

            let expected_rate = 0;
            if (ruleRes.rows.length > 0) {
                expected_rate = this.calculateExpectedRate(rawRates, ruleRes.rows[0]);
            }

            const variance = (parseFloat(vendor_rate) - expected_rate) * parseFloat(qty);

            const result = await client.query(
                `INSERT INTO bill_entries (date, supplier_id, item_name, qty, vendor_rate, expected_rate, variance, status)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending') RETURNING *`,
                [date, supplier_id, item_name, qty, vendor_rate, expected_rate, variance]
            );
            const billEntry = result.rows[0];

            // Update Inventory Stock if item exists
            let stockUpdated = false;
            let inventoryItemId = null;
            const itemRes = await client.query('SELECT id FROM inventory_items WHERE LOWER(name) = LOWER($1)', [item_name]);
            if (itemRes.rows.length > 0) {
                const itemId = itemRes.rows[0].id;
                inventoryItemId = itemId;
                await this.adjustStock(itemId, parseFloat(qty), 'PURCHASE', `Bill Entry #${billEntry.id}`, userId, client);
                stockUpdated = true;
                console.log(`✓ Stock updated for "${item_name}" (ID: ${itemId}): +${qty}`);
            } else {
                console.log(`⚠ Warning: Item "${item_name}" not found in inventory. Stock not updated.`);
            }

            const billAmount = parseFloat(qty) * parseFloat(vendor_rate);
            await client.query(
                `INSERT INTO vendor_ledger (date, supplier_id, transaction_type, amount, details, created_by)
                 VALUES ($1, $2, 'Bill', $3, $4, $5)`,
                [date, supplier_id, billAmount, `Bill for ${item_name} (${qty} x ${vendor_rate})`, userId]
            );

            await client.query('COMMIT');

            // Return bill entry with stock update status
            return {
                ...billEntry,
                stock_updated: stockUpdated,
                inventory_item_id: inventoryItemId
            };
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }
    }

    async getBillEntries(query) {
        const { date, supplierId } = query;
        let sql = `
            SELECT b.*, s.name as supplier_name 
            FROM bill_entries b
            JOIN suppliers s ON b.supplier_id = s.id
            WHERE 1=1
        `;
        const params = [];
        let pIdx = 1;

        if (date) {
            sql += ` AND b.date = $${pIdx++}`;
            params.push(date);
        }
        if (supplierId) {
            sql += ` AND b.supplier_id = $${pIdx++}`;
            params.push(supplierId);
        }

        sql += ' ORDER BY b.created_at DESC';
        const result = await db.query(sql, params);
        return result.rows;
    }

    async getBillSummary(query) {
        const { date, supplierId } = query;
        let sql = `
            SELECT 
                COUNT(*) as total_entries,
                COALESCE(SUM(qty * vendor_rate), 0) as total_amount,
                COALESCE(SUM(qty * expected_rate), 0) as total_expected,
                COALESCE(SUM(variance), 0) as total_variance,
                COUNT(CASE WHEN status = 'Approved' THEN 1 END) as approved_count,
                COUNT(CASE WHEN status = 'Pending' THEN 1 END) as pending_count
            FROM bill_entries
            WHERE 1=1
        `;
        const params = [];
        let pIdx = 1;

        if (date) {
            sql += ` AND date = $${pIdx++}`;
            params.push(date);
        }
        if (supplierId) {
            sql += ` AND supplier_id = $${pIdx++}`;
            params.push(supplierId);
        }

        const result = await db.query(sql, params);
        const data = result.rows[0];

        const totalAmount = parseFloat(data.total_amount);
        const totalVariance = parseFloat(data.total_variance);
        const variancePercentage = totalAmount > 0 ? ((totalVariance / totalAmount) * 100).toFixed(2) : 0;

        return {
            total_entries: parseInt(data.total_entries),
            total_amount: totalAmount,
            total_expected: parseFloat(data.total_expected),
            total_variance: totalVariance,
            variance_percentage: variancePercentage,
            approved_count: parseInt(data.approved_count),
            pending_count: parseInt(data.pending_count)
        };
    }

    async getVendorLedger(supplierId) {
        const result = await db.query(
            'SELECT * FROM vendor_ledger WHERE supplier_id = $1 ORDER BY date DESC, created_at DESC',
            [supplierId]
        );
        return result.rows;
    }
}

module.exports = new InventoryService();
