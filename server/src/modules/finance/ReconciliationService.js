const pool = require('../../config/db');
const TransactionService = require('./TransactionService');

class ReconciliationService {

    /**
     * Get or Create Daily Balance entry
     * Used to initialize today's sheet
     */
    async getDailyBalance(date, type = 'Counter') {
        // Check if exists
        const res = await pool.query(
            "SELECT * FROM daily_balances WHERE date = $1 AND type = $2",
            [date, type]
        );

        if (res.rows.length > 0) {
            return res.rows[0];
        }

        // Create new
        // 1. Fetch previous day's closing
        const prevRes = await pool.query(
            "SELECT actual_closing_balance FROM daily_balances WHERE date < $1 AND type = $2 ORDER BY date DESC LIMIT 1",
            [date, type]
        );
        const opening = prevRes.rows.length > 0 ? parseFloat(prevRes.rows[0].actual_closing_balance || 0) : 0;

        // Insert
        const insertRes = await pool.query(
            "INSERT INTO daily_balances (date, type, opening_balance) VALUES ($1, $2, $3) RETURNING *",
            [date, type, opening]
        );
        return insertRes.rows[0];
    }

    /**
     * Update Daily Balance (Closing)
     */
    async updateDailyBalance(date, type, data) {
        const { actual_closing_balance, status } = data;

        let query = "UPDATE daily_balances SET updated_at = NOW()";
        const values = [];
        let p = 1;

        if (actual_closing_balance !== undefined) {
            query += `, actual_closing_balance = $${p++}`;
            values.push(actual_closing_balance);
        }
        if (status) {
            query += `, status = $${p++}`;
            values.push(status);
        }

        query += ` WHERE date = $${p++} AND type = $${p++} RETURNING *`;
        values.push(date, type);

        const res = await pool.query(query, values);
        return res.rows[0];
    }

    /**
     * Calculate Reconciliation Data (Counter)
     */
    async getCounterReconciliation(date) {
        // 1. Get Balance Entry
        const balance = await this.getDailyBalance(date, 'Counter');

        // 2. Get Transaction Totals
        // Inflow: Cash Sales
        const inflow = await TransactionService.getSalesByMethod(date, 'Cash');

        // Outflow: Cash Expenses
        const outflow = await TransactionService.getExpensesByMethod(date, 'Cash');

        // Transfer Out: Cash handed to Manager (Mode = Bank_Cash, Type = Sales/Income) 
        // Note: In our definition, Bank_Cash Income is "Cash out of Counter to Manager".
        // Wait, normally Income adds to cash. 
        // Definition: "INCOME (Cash Out of Counter): When the Biller records cash (>1k) being physically moved from the counter cash drawer to the Manager".
        // This is confusing terminology in the requirement but clear logic:
        // Cash Drawer -> Manager Float.
        // If recorded as "Sales" with Mode "Bank_Cash", it usually means Money IN.
        // User says: "The 'Bank_Cash' Mode... INCOME (Cash Out of Counter)".
        // Meaning the entry is in the Income Sheet?
        // IF Biller enters +1000 Bank_Cash. 
        // Implementation: We filter transactions where mode='Bank_Cash' and type='Sales'.
        // Let's assume the user enters positive numbers.
        const sumQuery = `
            SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
            WHERE date = $1 AND type = 'Sales' AND mode = 'Bank_Cash'
        `;
        const transferRes = await pool.query(sumQuery, [date]);
        const transferOut = parseFloat(transferRes.rows[0].total);

        // Theoretical Closing
        // Opening + Inflow - Outflow - TransferOut
        const theoretical = parseFloat(balance.opening_balance) + inflow - outflow - transferOut;

        return {
            date,
            opening_balance: parseFloat(balance.opening_balance),
            cash_inflow: inflow,
            cash_outflow: outflow,
            transfer_out: transferOut,
            theoretical_closing: theoretical,
            actual_closing: balance.actual_closing_balance ? parseFloat(balance.actual_closing_balance) : null,
            difference: balance.actual_closing_balance ? parseFloat(balance.actual_closing_balance) - theoretical : null,
            status: balance.status
        };
    }

    /**
     * Calculate Manager Float
     */
    async getManagerFloat(date) {
        const balance = await this.getDailyBalance(date, 'Float');

        // Replenishment (Incoming from Counter)
        const sumQuery = `
            SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
            WHERE date = $1 AND type = 'Sales' AND mode = 'Bank_Cash'
        `;
        const transferRes = await pool.query(sumQuery, [date]);
        const replenishment = parseFloat(transferRes.rows[0].total);

        // Float Expenses (Manager Spending)
        // Expense with Mode = Bank_Cash
        const expQuery = `
            SELECT COALESCE(SUM(amount), 0) as total FROM transactions 
            WHERE date = $1 AND type = 'Expense' AND mode = 'Bank_Cash'
        `;
        const expRes = await pool.query(expQuery, [date]);
        const floatExpenses = parseFloat(expRes.rows[0].total);

        const theoretical = parseFloat(balance.opening_balance) + replenishment - floatExpenses;

        return {
            date,
            opening_float: parseFloat(balance.opening_balance),
            replenishment,
            float_expenses: floatExpenses,
            current_float: theoretical
        };
    }

}

module.exports = new ReconciliationService();
