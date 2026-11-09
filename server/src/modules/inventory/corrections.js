const db = require("../../config/db");
const { DomainError, statusFor } = require("../../utils/domain");
const { assertWritable } = require("../finance/writeGuard");
const JournalService = require("../finance/JournalService");
const valuation = require("./valuation");
async function record(
  c,
  kind,
  id,
  itemId,
  qty,
  value,
  reason,
  userId,
  journalId = null,
) {
  if (!reason?.trim()) throw new DomainError("Correction reason required");
  const item = await valuation.lock(c, itemId);
  await valuation.change(c, item, qty, value);
  const row = (
    await c.query(
      "INSERT INTO stock_corrections(source_type,source_id,inventory_item_id,quantity_change,value_change,reason,created_by,journal_entry_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [kind, String(id), itemId, qty, value, reason.trim(), userId, journalId],
    )
  ).rows[0];
  await c.query(
    "INSERT INTO stock_movements(inventory_item_id,movement_type,quantity_change,details,created_by_user_id) VALUES($1,$2,$3,$4,$5)",
    [
      itemId,
      qty > 0 ? "ADJ_IN" : "ADJ_OUT",
      qty,
      kind + " correction #" + row.id + ": " + reason,
      userId,
    ],
  );
  await c.query(
    "INSERT INTO inventory_transactions(inventory_item_id,transaction_type,quantity,unit_cost,value_change,reference_id,reference_type) VALUES($1,'Adjustment',$2,$3,$4,$5,'StockCorrection')",
    [itemId, qty, qty ? Math.abs(value / qty) : 0, value, row.id],
  );
  return row;
}
async function returnReceipt(c, receipt, reason, userId) {
  return record(
    c,
    receipt.source_type,
    receipt.source_id,
    receipt.inventory_item_id,
    -Number(receipt.quantity),
    -Number(receipt.value),
    reason,
    userId,
  );
}
async function reverse(kind, id, reason, userId) {
  if (!reason?.trim()) throw new DomainError("Correction reason required");
  const c = await db.pool.connect();
  try {
    await c.query("BEGIN");
    await assertWritable(c, new Date(), [
      1200,
      kind === "Wastage" ? 6000 : 6200,
    ]);
    const table = kind === "Wastage" ? "wastage_logs" : "stock_adjustments";
    const source = (
      await c.query("SELECT * FROM " + table + " WHERE id=$1 FOR UPDATE", [id])
    ).rows[0];
    if (!source) throw new DomainError("Stock record not found", 404);
    const prior = (
      await c.query(
        "SELECT * FROM stock_corrections WHERE source_type=$1 AND source_id=$2",
        [kind, String(id)],
      )
    ).rows[0];
    if (prior) {
      if (prior.reason !== reason.trim())
        throw new DomainError(
          "Record already reversed with another reason",
          409,
        );
      await c.query("COMMIT");
      return prior;
    }
    const qty =
      kind === "Wastage" ? Number(source.qty) : -Number(source.quantity_change);
    const value =
      kind === "Wastage"
        ? Number(source.cost)
        : -(source.value_change == null
            ? valuation.money(source.quantity_change * source.unit_cost)
            : Number(source.value_change));
    const journal = source.journal_entry_id
      ? await JournalService.reverseJournalEntry(
          source.journal_entry_id,
          reason,
          new Date(),
          c,
        )
      : null;
    const result = await record(
      c,
      kind,
      id,
      source.inventory_item_id,
      qty,
      value,
      reason,
      userId,
      journal?.id,
    );
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
const controller = (kind) => async (req, res) => {
  try {
    res.json(await reverse(kind, req.params.id, req.body.reason, req.user.id));
  } catch (e) {
    res.status(statusFor(e)).json({ error: e.message });
  }
};
module.exports = {
  record,
  returnReceipt,
  reverse,
  reverseAdjustment: controller("StockAdjustment"),
  reverseWastage: controller("Wastage"),
};
