const db = require('../../config/db');

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

        // 4. Financial Entry (Debit Wastage Expense, Credit Inventory Asset)
        // Need a Wastage Expense Account (e.g., 6100). For now using 6000 (General Expense)
        const jeRes = await client.query("INSERT INTO journal_entries (description) VALUES ($1) RETURNING id", [`Wastage: ${reason}`]);
        const jeId = jeRes.rows[0].id;

        await client.query("INSERT INTO ledger_lines (journal_entry_id, account_code, debit) VALUES ($1, 6000, $2)", [jeId, cost]);
        await client.query("INSERT INTO ledger_lines (journal_entry_id, account_code, credit) VALUES ($1, 1200, $2)", [jeId, cost]); // 1200 = Inventory Asset

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};
