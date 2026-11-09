const { DomainError, finite } = require("../../utils/domain");
const money = (v) => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const quantity = (v) => Number(Number(v).toFixed(4));
const valueOf = (item) =>
  item.stock_value == null
    ? money(Number(item.stock_qty) * Number(item.unit_cost))
    : Number(item.stock_value);
async function lock(c, id) {
  const item = (
    await c.query("SELECT * FROM inventory_items WHERE id=$1 FOR UPDATE", [id])
  ).rows[0];
  if (!item) throw new DomainError("Inventory item not found", 404);
  return item;
}
async function change(c, item, qty, value) {
  qty = quantity(qty);
  value = money(value);
  const after = quantity(Number(item.stock_qty) + qty),
    book = money(valueOf(item) + value);
  if (after < 0 || book < 0 || (after === 0 && book !== 0))
    throw new DomainError(
      "Stock correction exceeds available quantity or value",
      409,
    );
  return (
    await c.query(
      "UPDATE inventory_items SET stock_qty=$2,stock_value=$3,unit_cost=$4,updated_at=NOW() WHERE id=$1 RETURNING *",
      [item.id, after, book, after ? money(book / after) : item.unit_cost],
    )
  ).rows[0];
}
function outgoing(item, qty) {
  qty = quantity(finite(qty, "Stock quantity", { positive: true }));
  if (!qty || qty > Number(item.stock_qty))
    throw new DomainError("Insufficient inventory");
  return qty === Number(item.stock_qty)
    ? valueOf(item)
    : money((valueOf(item) * qty) / Number(item.stock_qty));
}
async function receive(c, id, qty, value, sourceType, sourceId, userId) {
  qty = quantity(finite(qty, "Receipt quantity", { positive: true }));
  value = money(finite(value, "Receipt value"));
  if (!qty) throw new DomainError("Receipt quantity must be at least 0.0001");
  const item = await lock(c, id);
  const row = (
    await c.query(
      "INSERT INTO stock_receipts(inventory_item_id,source_type,source_id,quantity,value,quantity_before,value_before,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",
      [
        id,
        sourceType,
        String(sourceId),
        qty,
        value,
        item.stock_qty,
        valueOf(item),
        userId,
      ],
    )
  ).rows[0];
  await change(c, item, qty, value);
  await c.query(
    "INSERT INTO stock_movements(inventory_item_id,movement_type,quantity_change,details,created_by_user_id) VALUES($1,'PURCHASE',$2,$3,$4)",
    [
      id,
      qty,
      sourceType === "PurchaseOrder"
        ? "PO #" + sourceId
        : "Bill Entry #" + sourceId,
      userId,
    ],
  );
  await c.query(
    "INSERT INTO inventory_transactions(inventory_item_id,transaction_type,quantity,unit_cost,reference_id,reference_type) VALUES($1,'Purchase',$2,$3,$4,$5)",
    [id, qty, qty ? value / qty : 0, sourceId, sourceType],
  );
  return row;
}
module.exports = { money, quantity, valueOf, lock, change, outgoing, receive };
