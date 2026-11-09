const db = require("../../config/db");
const { DomainError, statusFor } = require("../../utils/domain");
const { assertWritable } = require("../finance/writeGuard");
const JournalService = require("../finance/JournalService");
const valuation = require("../inventory/valuation");
async function refund(id, data, userId, key) {
  if (!key) throw new DomainError("Refund retry key required");
  if (!data.reason?.trim()) throw new DomainError("Refund reason required");
  if (typeof data.returnStock !== "boolean")
    throw new DomainError("Explicit stock return choice required");
  const pos = require("./service");
  return pos.atomic((c) =>
    pos.retry(c, "order-refund:" + userId, key, { id, ...data }, async () => {
      await assertWritable(c, new Date());
      const order = (
        await c.query("SELECT * FROM orders WHERE id=$1 FOR UPDATE", [id])
      ).rows[0];
      if (!order) throw new DomainError("Order not found", 404);
      if (order.status === "Cancelled")
        throw new DomainError("Order already refunded", 409);
      const ticket = (
        await c.query(
          "SELECT * FROM kds_tickets WHERE order_id=$1 FOR UPDATE",
          [id],
        )
      ).rows[0];
      if (data.returnStock && (!ticket || ticket.status !== "Pending"))
        throw new DomainError(
          "Stock can only be returned before preparation starts",
          409,
        );
      const payments = (
        await c.query(
          "SELECT * FROM payment_transactions WHERE order_id=$1 AND status='Completed' ORDER BY id FOR UPDATE",
          [id],
        )
      ).rows;
      if (
        valuation.money(payments.reduce((s, p) => s + Number(p.amount), 0)) !==
        Number(order.paid_amount)
      )
        throw new DomainError(
          "Payment history needs reconciliation before refund",
          409,
        );
      const row = (
        await c.query(
          "INSERT INTO order_refunds(order_id,amount,receivable_cancelled,return_stock,reason,created_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
          [
            id,
            order.paid_amount,
            valuation.money(
              Number(order.total_amount) - Number(order.paid_amount),
            ),
            data.returnStock,
            data.reason.trim(),
            userId,
          ],
        )
      ).rows[0];
      const journals = (
        await c.query(
          "SELECT id FROM journal_entries WHERE (reference_type='POSOrder' AND reference_id=$1) OR id=ANY($2::uuid[]) ORDER BY id",
          [String(id), payments.map((p) => p.journal_entry_id).filter(Boolean)],
        )
      ).rows;
      if (Number(order.total_amount) > 0 && !journals.length)
        throw new DomainError("Order journal missing", 409);
      for (const journal of journals)
        await JournalService.reverseJournalEntry(
          journal.id,
          data.reason,
          new Date(),
          c,
        );
      if (data.returnStock) {
        const transactions = (
          await c.query(
            "SELECT * FROM inventory_transactions WHERE reference_type='Order' AND reference_id=$1 AND transaction_type='Sale' ORDER BY inventory_item_id",
            [id],
          )
        ).rows;
        for (const t of transactions) {
          if (t.value_change == null)
            throw new DomainError(
              "Historical stock value needs reconciliation before return",
              409,
            );
          await require("../inventory/corrections").record(
            c,
            "POSOrder",
            id,
            t.inventory_item_id,
            -Number(t.quantity),
            -Number(t.value_change),
            data.reason,
            userId,
          );
        }
        const cogs = (
          await c.query(
            "SELECT id FROM journal_entries WHERE reference_type='COGS' AND reference_id=$1",
            [String(id)],
          )
        ).rows;
        for (const journal of cogs)
          await JournalService.reverseJournalEntry(
            journal.id,
            data.reason,
            new Date(),
            c,
          );
      }
      await c.query(
        "UPDATE payment_transactions SET status='Refunded',refund_id=$2 WHERE order_id=$1 AND status='Completed'",
        [id, row.id],
      );
      await c.query(
        "UPDATE orders SET status='Cancelled',payment_status='Refunded' WHERE id=$1",
        [id],
      );
      await c.query(
        "UPDATE kds_tickets SET status='Cancelled',updated_by=$2 WHERE order_id=$1",
        [id, userId],
      );
      return { success: true, refund: row };
    }),
  );
}
exports.refund = refund;
exports.controller = async (req, res) => {
  try {
    res.json(
      await refund(
        req.params.id,
        req.body,
        req.user.id,
        req.get("Idempotency-Key"),
      ),
    );
  } catch (e) {
    res.status(statusFor(e)).json({ error: e.message });
  }
};
