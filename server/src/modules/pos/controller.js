const db = require('../../config/db');

exports.getMenu = async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM menu_items ORDER BY category');
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.addMenuItem = async (req, res) => {
    const { name, price, category } = req.body;

    if (!name || !price || !category) {
        return res.status(400).json({ error: 'Name, price, and category are required' });
    }

    if (parseFloat(price) <= 0) {
        return res.status(400).json({ error: 'Price must be greater than 0' });
    }

    try {
        const result = await db.query(
            'INSERT INTO menu_items (name, price, category) VALUES ($1, $2, $3) RETURNING *',
            [name, parseFloat(price), category]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.deleteMenuItem = async (req, res) => {
    const { id } = req.params;

    try {
        // Delete recipe ingredients first (foreign key constraint)
        await db.query('DELETE FROM recipe_ingredients WHERE menu_item_id = $1', [id]);

        // Delete menu item
        const result = await db.query('DELETE FROM menu_items WHERE id = $1 RETURNING *', [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Menu item not found' });
        }

        res.json({ success: true, message: 'Menu item deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createOrder = async (req, res) => {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const { items } = req.body;
        let totalRevenue = 0;
        let totalCOGS = 0;

        const jeRes = await client.query("INSERT INTO journal_entries (description) VALUES ('POS Sale') RETURNING id");
        const jeId = jeRes.rows[0].id;

        for (const item of items) {
            totalRevenue += item.price * item.qty;
            const recipeRes = await client.query(
                `SELECT r.inventory_item_id, r.quantity_required, i.unit_cost 
                 FROM recipe_ingredients r
                 JOIN inventory_items i ON r.inventory_item_id = i.id
                 WHERE r.menu_item_id = $1`, [item.id]
            );

            for (const ing of recipeRes.rows) {
                const qtyUsed = ing.quantity_required * item.qty;
                totalCOGS += qtyUsed * ing.unit_cost;
                await client.query("UPDATE inventory_items SET stock_qty = stock_qty - $1 WHERE id = $2", [qtyUsed, ing.inventory_item_id]);
            }
        }

        // Ledger: Debit Cash, Credit Revenue | Debit COGS, Credit Inventory
        await client.query("INSERT INTO ledger_lines (journal_entry_id, account_code, debit) VALUES ($1, 1000, $2)", [jeId, totalRevenue]);
        await client.query("INSERT INTO ledger_lines (journal_entry_id, account_code, credit) VALUES ($1, 4000, $2)", [jeId, totalRevenue]);
        await client.query("INSERT INTO ledger_lines (journal_entry_id, account_code, debit) VALUES ($1, 5000, $2)", [jeId, totalCOGS]);
        await client.query("INSERT INTO ledger_lines (journal_entry_id, account_code, credit) VALUES ($1, 1200, $2)", [jeId, totalCOGS]);

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
};
