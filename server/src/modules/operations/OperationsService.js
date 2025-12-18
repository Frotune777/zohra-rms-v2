const db = require('../../config/db');
const JournalService = require('../finance/JournalService');
const JournalEntry = require('../finance/entities/JournalEntry');

class OperationsService {
    /**
     * Log Wastage
     * 
     * @param {Object} params - Wastage parameters
     * @param {String} reportedBy - User email
     * @param {Object} client - DB client
     */
    async logWastage({ inventory_item_id, qty, reason }, reportedBy, client) {
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
            [inventory_item_id, qty, reason, cost, reportedBy]
        );
        const wastageLog = result.rows[0];

        // 3. Reduce Inventory
        await client.query("UPDATE inventory_items SET stock_qty = stock_qty - $1 WHERE id = $2", [qty, inventory_item_id]);

        // 4. Financial Journaling (Using Domain Entity)
        if (cost > 0) {
            const wastageJournal = new JournalEntry({
                date: new Date(),
                description: `Wastage Logging: ${reason}`,
                reference_id: wastageLog.id,
                reference_type: 'Wastage',
                lines: [
                    { account_code: 6000, debit: parseFloat(cost.toFixed(2)), credit: 0 }, // Dr: General Expense (Wastage)
                    { account_code: 1200, debit: 0, credit: parseFloat(cost.toFixed(2)) }  // Cr: Inventory Asset
                ]
            });

            await JournalService.createJournalEntry(wastageJournal, client);
        }

        return wastageLog;
    }

    /**
     * Get Wastage Logs
     */
    async getWastageLogs() {
        const result = await db.query(`
            SELECT w.*, i.name as item_name, i.unit 
            FROM wastage_logs w
            JOIN inventory_items i ON w.inventory_item_id = i.id
            ORDER BY w.created_at DESC
        `);
        return result.rows;
    }
}

module.exports = new OperationsService();
