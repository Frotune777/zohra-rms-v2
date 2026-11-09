const db = require("../../config/db");
const JournalService = require("../finance/JournalService");
const { assertWritable } = require("../finance/writeGuard");
const { DomainError, finite, statusFor } = require("../../utils/domain");

exports.getPurchaseOrders = async (req, res) => {
  try {
    const result = await db.query(`
            SELECT po.*, s.name as supplier_name, (SELECT jsonb_agg(jsonb_build_object('inventory_item_id',i.inventory_item_id,'name',v.name,'qty',i.qty_ordered,'qty_received',i.qty_received,'unit_cost',i.unit_cost) ORDER BY i.id) FROM purchase_order_items i JOIN inventory_items v ON v.id=i.inventory_item_id WHERE i.po_id=po.id) AS items
            FROM purchase_orders po
            JOIN suppliers s ON po.supplier_id = s.id
            ORDER BY po.created_at DESC
        `);
    res.json(result.rows);
  } catch (err) {
    res.status(statusFor(err)).json({ error: err.message });
  }
};

exports.createPurchaseOrder = async (req, res) => {
  const { supplier_id, items } = req.body; // items: [{ inventory_item_id, qty, unit_cost }]

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    if (!Array.isArray(items) || !items.length)
      throw new DomainError("Purchase order items are required");
    if (
      new Set(items.map((i) => Number(i.inventory_item_id))).size !==
      items.length
    )
      throw new DomainError("Duplicate purchase items");
    let total_amount = 0;
    for (const item of items) {
      const qty = finite(item.qty, "Quantity", { positive: true }),
        cost = finite(item.unit_cost, "Unit cost");
      if (qty !== Number(qty.toFixed(2)) || cost !== Number(cost.toFixed(2)))
        throw new DomainError(
          "Purchase quantity and cost support two decimals",
        );
      total_amount += Number((qty * cost).toFixed(2));
    }

    const poRes = await client.query(
      "INSERT INTO purchase_orders (supplier_id, total_amount, status) VALUES ($1, $2, 'Draft') RETURNING *",
      [supplier_id, total_amount],
    );
    const po = poRes.rows[0];

    for (const item of items) {
      await client.query(
        "INSERT INTO purchase_order_items (po_id, inventory_item_id, qty_ordered, unit_cost) VALUES ($1, $2, $3, $4)",
        [po.id, item.inventory_item_id, item.qty, item.unit_cost],
      );
    }

    await client.query("COMMIT");
    res.json(po);
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(statusFor(err)).json({ error: err.message });
  } finally {
    client.release();
  }
};

exports.updatePOStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // Sent, Received, Cancelled

  const client = await db.pool.connect();
  try {
    await client.query("BEGIN");
    if (!["Draft", "Sent", "Received", "Cancelled"].includes(status))
      throw new DomainError("Invalid purchase order status");
    await assertWritable(client, new Date(), [1200]);
    const poRes = await client.query(
      "SELECT * FROM purchase_orders WHERE id = $1 FOR UPDATE",
      [id],
    );
    if (poRes.rows.length === 0) {
      throw new DomainError("PO not found", 404);
    }
    const po = poRes.rows[0];

    if (po.status === "Received") {
      if (status !== "Received")
        throw new DomainError("Received purchase orders cannot be reset", 409);
      await client.query("COMMIT");
      return res.json(po);
    }
    if (po.status === "Cancelled" && status !== "Cancelled")
      throw new DomainError(
        "Cancelled purchase orders cannot be reopened",
        409,
      );
    if (po.status === "Sent" && status === "Draft")
      throw new DomainError("Sent purchase orders cannot return to Draft", 409);
    if (status === "Received") {
      const supplier = (
        await client.query(
          "SELECT ledger_account_code FROM suppliers WHERE id=$1 FOR UPDATE",
          [po.supplier_id],
        )
      ).rows[0];
      // Receive Stock
      const itemsRes = await client.query(
        "SELECT * FROM purchase_order_items WHERE po_id = $1 ORDER BY inventory_item_id",
        [id],
      );
      for (const item of itemsRes.rows) {
        await require("./valuation").receive(
          client,
          item.inventory_item_id,
          item.qty_ordered,
          Number(
            (Number(item.qty_ordered) * Number(item.unit_cost)).toFixed(2),
          ),
          "PurchaseOrder",
          po.id,
          req.user.id,
        );

        // Mark item as received
        await client.query(
          "UPDATE purchase_order_items SET qty_received = $1 WHERE id = $2",
          [item.qty_ordered, item.id],
        );
      }

      // Free receipts change stock but create no supplier debt or journal.
      if (Number(po.total_amount) > 0) {
        await client.query(
          "INSERT INTO vendor_ledger (date, supplier_id, transaction_type, amount, details) VALUES (CURRENT_DATE, $1, 'Bill', $2, $3)",
          [po.supplier_id, po.total_amount, `PO #${po.id} Received`],
        );
        await JournalService.createJournalEntry(
          {
            date: new Date(),
            description: "PO #" + po.id + " Received",
            reference_type: "PurchaseOrder",
            reference_id: po.id,
            lines: [
              { account_code: 1200, debit: Number(po.total_amount) },
              {
                account_code: supplier.ledger_account_code || 2000,
                credit: Number(po.total_amount),
              },
            ],
          },
          client,
        );
      }
    }

    const result = await client.query(
      "UPDATE purchase_orders SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [status, id],
    );

    await client.query("COMMIT");
    res.json(result.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(statusFor(err)).json({ error: err.message });
  } finally {
    client.release();
  }
};
