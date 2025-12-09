const db = require('../../config/db');

exports.getPurchaseOrders = async (req, res) => {
    try {
        const result = await db.query(`
            SELECT po.*, s.name as supplier_name 
            FROM purchase_orders po
            JOIN suppliers s ON po.supplier_id = s.id
            ORDER BY po.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createPurchaseOrder = async (req, res) => {
    const { supplier_id, items } = req.body; // items: [{ inventory_item_id, qty, unit_cost }]

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        let total_amount = 0;
        for (const item of items) {
            total_amount += parseFloat(item.qty) * parseFloat(item.unit_cost);
        }

        const poRes = await client.query(
            "INSERT INTO purchase_orders (supplier_id, total_amount, status) VALUES ($1, $2, 'Draft') RETURNING *",
            [supplier_id, total_amount]
        );
        const po = poRes.rows[0];

        for (const item of items) {
            await client.query(
                "INSERT INTO purchase_order_items (po_id, inventory_item_id, qty_ordered, unit_cost) VALUES ($1, $2, $3, $4)",
                [po.id, item.inventory_item_id, item.qty, item.unit_cost]
            );
        }

        await client.query('COMMIT');
        res.json(po);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};

exports.updatePOStatus = async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // Sent, Received, Cancelled

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const poRes = await client.query("SELECT * FROM purchase_orders WHERE id = $1", [id]);
        if (poRes.rows.length === 0) {
            throw new Error("PO not found");
        }
        const po = poRes.rows[0];

        if (status === 'Received' && po.status !== 'Received') {
            // Receive Stock
            const itemsRes = await client.query("SELECT * FROM purchase_order_items WHERE po_id = $1", [id]);
            for (const item of itemsRes.rows) {
                // Update Inventory
                await client.query(
                    "UPDATE inventory_items SET stock_qty = stock_qty + $1, unit_cost = $2 WHERE id = $3",
                    [item.qty_ordered, item.unit_cost, item.inventory_item_id]
                );

                // Mark item as received
                await client.query("UPDATE purchase_order_items SET qty_received = $1 WHERE id = $2", [item.qty_ordered, item.id]);
            }

            // Create Bill / Liability automatically?
            // For now, let's just update status. User might create Bill separately or we can automate it here.
            // Let's automate Vendor Ledger entry for simplicity.
            await client.query(
                "INSERT INTO vendor_ledger (date, supplier_id, transaction_type, amount, details) VALUES (CURRENT_DATE, $1, 'Bill', $2, $3)",
                [po.supplier_id, po.total_amount, `PO #${po.id} Received`]
            );
        }

        const result = await client.query("UPDATE purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *", [status, id]);

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};
