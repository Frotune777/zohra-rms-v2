const db = require("../../config/db");
const { DomainError, finite, statusFor } = require("../../utils/domain");
const JournalService = require("../finance/JournalService");
const { assertWritable } = require("../finance/writeGuard");
async function atomic(fn) {
  const c = await db.pool.connect();
  try {
    await c.query("BEGIN");
    const r = await fn(c);
    await c.query("COMMIT");
    return r;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
const respond = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    res.status(statusFor(e)).json({ error: e.message });
  }
};
exports.recipes = respond(
  async () =>
    (
      await db.query(
        "SELECT m.id,m.name,COALESCE(jsonb_agg(jsonb_build_object('inventory_item_id',i.id,'name',i.name,'unit',i.unit,'quantity_required',r.quantity_required,'unit_cost',i.unit_cost)) FILTER(WHERE i.id IS NOT NULL),'[]') AS ingredients,COALESCE(SUM(r.quantity_required*i.unit_cost),0) AS recipe_cost FROM menu_items m LEFT JOIN recipe_ingredients r ON r.menu_item_id=m.id LEFT JOIN inventory_items i ON i.id=r.inventory_item_id GROUP BY m.id ORDER BY m.name",
      )
    ).rows,
);
exports.saveRecipe = respond((req) =>
  atomic(async (c) => {
    const rows = req.body.ingredients;
    if (!Array.isArray(rows)) throw new DomainError("Ingredients required");
    if (
      new Set(rows.map((r) => Number(r.inventory_item_id))).size !== rows.length
    )
      throw new DomainError("Duplicate ingredients");
    const menu = (
      await c.query("SELECT id FROM menu_items WHERE id=$1 FOR UPDATE", [
        req.params.id,
      ])
    ).rows[0];
    if (!menu) throw new DomainError("Menu item not found", 404);
    for (const r of rows)
      if (
        finite(r.quantity_required, "Ingredient quantity", { positive: true }) <
        0.0001
      )
        throw new DomainError("Ingredient quantity must be at least 0.0001");
    const ids = rows.map((r) => Number(r.inventory_item_id));
    const items = await c.query(
      "SELECT id FROM inventory_items WHERE id=ANY($1) ORDER BY id FOR SHARE",
      [ids],
    );
    if (items.rowCount !== rows.length)
      throw new DomainError("Unknown ingredient");
    await c.query("DELETE FROM recipe_ingredients WHERE menu_item_id=$1", [
      menu.id,
    ]);
    for (const r of rows)
      await c.query(
        "INSERT INTO recipe_ingredients(menu_item_id,inventory_item_id,quantity_required) VALUES($1,$2,$3)",
        [menu.id, r.inventory_item_id, r.quantity_required],
      );
    return { success: true };
  }),
);
async function adjust(c, id, change, reason, userId) {
  change = Number(
    finite(change, "Quantity change", { min: -Infinity }).toFixed(4),
  );
  if (!change) throw new DomainError("Nonzero quantity change required");
  if (!reason?.trim()) throw new DomainError("Adjustment reason required");
  await assertWritable(c, new Date(), [1200, 6200]);
  const item = (
    await c.query("SELECT * FROM inventory_items WHERE id=$1 FOR UPDATE", [id])
  ).rows[0];
  if (!item) throw new DomainError("Item not found", 404);
  const before = Number(item.stock_qty),
    after = Number((before + change).toFixed(4));
  if (after < 0) throw new DomainError("Adjustment exceeds available stock");
  const row = (
    await c.query(
      "INSERT INTO stock_adjustments(inventory_item_id,quantity_change,quantity_before,quantity_after,unit_cost,reason,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
      [id, change, before, after, item.unit_cost, reason.trim(), userId],
    )
  ).rows[0];
  const valuation = require("./valuation");
  const signedValue =
    change < 0
      ? -valuation.outgoing(item, -change)
      : valuation.money(change * Number(item.unit_cost));
  const value = Math.abs(signedValue);
  row.value_change = signedValue;
  await c.query("UPDATE stock_adjustments SET value_change=$2 WHERE id=$1", [
    row.id,
    signedValue,
  ]);
  if (value > 0) {
    const lines =
      change > 0
        ? [
            { account_code: 1200, debit: value },
            { account_code: 6200, credit: value },
          ]
        : [
            { account_code: 6200, debit: value },
            { account_code: 1200, credit: value },
          ];
    const je = await JournalService.createJournalEntry(
      {
        date: new Date(),
        description: reason,
        reference_type: "StockAdjustment",
        reference_id: row.id,
        lines,
      },
      c,
    );
    await c.query(
      "UPDATE stock_adjustments SET journal_entry_id=$2 WHERE id=$1",
      [row.id, je.id],
    );
    row.journal_entry_id = je.id;
  }
  await valuation.change(c, item, change, signedValue);
  await c.query(
    "INSERT INTO stock_movements(inventory_item_id,movement_type,quantity_change,details,created_by_user_id) VALUES($1,$2,$3,$4,$5)",
    [
      id,
      change > 0 ? "ADJ_IN" : "ADJ_OUT",
      change,
      "Adjustment #" + row.id + ": " + reason,
      userId,
    ],
  );
  await c.query(
    "INSERT INTO inventory_transactions(inventory_item_id,transaction_type,quantity,unit_cost,reference_id,reference_type) VALUES($1,'Adjustment',$2,$3,$4,'StockAdjustment')",
    [id, change, item.unit_cost, row.id],
  );
  return row;
}
exports.adjust = adjust;
exports.createAdjustment = respond((req) =>
  atomic((c) =>
    adjust(
      c,
      req.body.inventory_item_id,
      req.body.quantity_change,
      req.body.reason,
      req.user.id,
    ),
  ),
);
exports.adjustments = respond(
  async () =>
    (
      await db.query(
        "SELECT a.*,i.name AS item_name,u.full_name AS actor_name,(SELECT row_to_json(c) FROM stock_corrections c WHERE c.source_type='StockAdjustment' AND c.source_id=a.id::text) AS correction FROM stock_adjustments a JOIN inventory_items i ON i.id=a.inventory_item_id LEFT JOIN users u ON u.id=a.created_by ORDER BY a.id DESC LIMIT 500",
      )
    ).rows,
);
