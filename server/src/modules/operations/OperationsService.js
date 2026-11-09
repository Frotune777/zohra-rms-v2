const db = require("../../config/db");
const { DomainError, finite } = require("../../utils/domain");
const { assertWritable } = require("../finance/writeGuard");
const JournalService = require("../finance/JournalService");
const JournalEntry = require("../finance/entities/JournalEntry");

class OperationsService {
  /**
   * Log Wastage
   *
   * @param {Object} params - Wastage parameters
   * @param {String} reportedBy - User email
   * @param {Object} client - DB client
   */
  async logWastage({ inventory_item_id, qty, reason }, reportedBy, client) {
    qty = Number(
      finite(qty, "Wastage quantity", { positive: true }).toFixed(4),
    );
    if (!qty) throw new DomainError("Wastage quantity must be at least 0.0001");
    if (!reason?.trim()) throw new DomainError("Wastage reason required");
    await assertWritable(client, new Date(), [1200, 6000]);
    // 1. Get Item Cost
    const itemRes = await client.query(
      "SELECT * FROM inventory_items WHERE id = $1 FOR UPDATE",
      [inventory_item_id],
    );
    if (itemRes.rows.length === 0) {
      throw new Error("Item not found");
    }
    const item = itemRes.rows[0];
    if (qty > Number(item.stock_qty))
      throw new DomainError("Wastage exceeds available stock");
    const valuation = require("../inventory/valuation");
    const cost = valuation.outgoing(item, qty);

    // 2. Insert Log
    const result = await client.query(
      "INSERT INTO wastage_logs (inventory_item_id, qty, reason, cost, reported_by) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [inventory_item_id, qty, reason, cost, reportedBy],
    );
    const wastageLog = result.rows[0];

    // 3. Reduce Inventory
    await valuation.change(client, item, -qty, -cost);

    // 4. Financial Journaling (Using Domain Entity)
    if (cost > 0) {
      const wastageJournal = new JournalEntry({
        date: new Date(),
        description: `Wastage Logging: ${reason}`,
        reference_id: wastageLog.id,
        reference_type: "Wastage",
        lines: [
          { account_code: 6000, debit: parseFloat(cost.toFixed(2)), credit: 0 }, // Dr: General Expense (Wastage)
          { account_code: 1200, debit: 0, credit: parseFloat(cost.toFixed(2)) }, // Cr: Inventory Asset
        ],
      });

      const je = await JournalService.createJournalEntry(
        wastageJournal,
        client,
      );
      await client.query(
        "UPDATE wastage_logs SET journal_entry_id=$1 WHERE id=$2",
        [je.id, wastageLog.id],
      );
      wastageLog.journal_entry_id = je.id;
    }

    const user = (
      await client.query("SELECT id FROM users WHERE email=$1", [reportedBy])
    ).rows[0];
    await client.query(
      "INSERT INTO stock_movements(inventory_item_id,movement_type,quantity_change,details,created_by_user_id) VALUES($1,'WASTAGE',$2,$3,$4)",
      [inventory_item_id, -qty, "Wastage #" + wastageLog.id, user?.id],
    );
    return wastageLog;
  }

  /**
   * Get Wastage Logs
   */
  async getWastageLogs() {
    const result = await db.query(`
            SELECT w.*, i.name as item_name, i.unit,(SELECT row_to_json(c) FROM stock_corrections c WHERE c.source_type='Wastage' AND c.source_id=w.id::text) AS correction 
            FROM wastage_logs w
            JOIN inventory_items i ON w.inventory_item_id = i.id
            ORDER BY w.created_at DESC
        `);
    return result.rows;
  }
}

module.exports = new OperationsService();
