const db = require('../../config/db');
const JournalService = require('../finance/JournalService');

exports.getWastageLogs = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT w.*, i.name as item_name, i.unit 
            FROM wastage_logs w
            JOIN inventory_items i ON w.inventory_item_id = i.id
            ORDER BY w.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.logWastage = async (req, res) => {
    const { inventory_item_id, qty, reason } = req.body;
    const reported_by = req.user.email;

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        // 1. Get Item Cost
        const itemRes = await client.query("SELECT unit_cost, stock_qty FROM inventory_items WHERE id = $1", [inventory_item_id]);
        if (itemRes.rows.length === 0) {
            throw new Error("Item not found");
        }
        const item = itemRes.rows[0];
        const cost = parseFloat(item.unit_cost) * parseFloat(qty);

        // 2. Insert Log
        const result = await client.query(
            "INSERT INTO wastage_logs (inventory_item_id, qty, reason, cost, reported_by) VALUES ($1, $2, $3, $4, $5) RETURNING *",
            [inventory_item_id, qty, reason, cost, reported_by]
        );

        // 3. Reduce Inventory
        await client.query("UPDATE inventory_items SET stock_qty = stock_qty - $1 WHERE id = $2", [qty, inventory_item_id]);

        // 4. Financial Journaling (REFACTORED for Double-Entry)
        const journalEntry = {
            date: new Date(),
            description: `Wastage Logging: ${reason}`,
            reference_id: result.rows[0].id,
            reference_type: 'Wastage',
            lines: [
                { account_code: 6000, debit: parseFloat(cost.toFixed(2)), credit: 0 }, // Dr: General Expense (Wastage)
                { account_code: 1200, debit: 0, credit: parseFloat(cost.toFixed(2)) }  // Cr: Inventory Asset
            ]
        };

        if (cost > 0) {
            await JournalService.createJournalEntry(journalEntry, client);
        }

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};
