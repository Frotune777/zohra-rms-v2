/**
 * ClosureService - Daily Cash Closure & Variance Management
 * 
 * Purpose: Manage daily cash reconciliation and enforce closure rules
 * 
 * @module ClosureService
 */

const db = require('../../config/db');
const JournalService = require('./JournalService');

class ClosureService {
    /**
     * Close Daily Balance and Post Variance
     * 
     * @param {Date} date - Date to close
     * @param {String} type - 'Counter' or 'Float'
     * @param {Number} actualClosingBalance - Actual cash counted
     * @param {Number} userId - User performing closure
     * @returns {Promise<Object>} Closure result with variance info
     */
    async closeDailyBalance(date, type, actualClosingBalance, userId) {
        const client = await db.pool.connect();

        try {
            await client.query('BEGIN');

            // 1. Get existing balance record
            const balanceRes = await client.query(`
                SELECT * FROM daily_balances 
                WHERE date = $1 AND type = $2
            `, [date, type]);

            if (balanceRes.rows.length === 0) {
                throw new Error(`Daily balance record not found for ${date} (${type})`);
            }

            const balance = balanceRes.rows[0];

            if (balance.status === 'Closed') {
                throw new Error(`Day ${date} (${type}) already closed`);
            }

            const expectedClosing = parseFloat(balance.closing_balance);
            const actualClosing = parseFloat(actualClosingBalance);
            const variance = actualClosing - expectedClosing;

            // 2. If variance exists, create journal entry
            let varianceJeId = null;

            if (Math.abs(variance) >= 0.01) {
                const isShortage = variance < 0;
                const absVariance = Math.abs(variance);

                // Determine cash account based on type
                const cashAccount = type === 'Counter' ? 1000 : 1030; // 1000=Cash, 1030=Manager Float

                const journalEntry = {
                    date: date,
                    description: isShortage
                        ? `Cash Shortage - ${type}`
                        : `Cash Excess - ${type}`,
                    reference_type: 'CashVariance',
                    lines: isShortage ? [
                        { account_code: 7000, debit: absVariance, credit: 0 }, // Cash Shortage Expense
                        { account_code: cashAccount, debit: 0, credit: absVariance } // Reduce Cash
                    ] : [
                        { account_code: cashAccount, debit: absVariance, credit: 0 }, // Increase Cash
                        { account_code: 7100, debit: 0, credit: absVariance } // Cash Excess Income
                    ]
                };

                const je = await JournalService.createJournalEntry(journalEntry, client);
                varianceJeId = je.id;
            }

            // 3. Update daily balance to Closed
            await client.query(`
                UPDATE daily_balances 
                SET actual_closing_balance = $1,
                    status = 'Closed',
                    closed_by = $2,
                    closed_at = NOW(),
                    variance_je_id = $3
                WHERE date = $4 AND type = $5
            `, [actualClosing, userId, varianceJeId, date, type]);

            // 4. Set next day's opening balance
            const nextDay = new Date(date);
            nextDay.setDate(nextDay.getDate() + 1);
            const nextDayStr = nextDay.toISOString().split('T')[0];

            await client.query(`
                INSERT INTO daily_balances (date, type, opening_balance, closing_balance, status)
                VALUES ($1, $2, $3, $3, 'Open')
                ON CONFLICT (date, type) 
                DO UPDATE SET opening_balance = $3
            `, [nextDayStr, type, actualClosing]);

            await client.query('COMMIT');

            return {
                success: true,
                date: date,
                type: type,
                expected_closing: expectedClosing,
                actual_closing: actualClosing,
                variance: variance,
                variance_posted: varianceJeId !== null,
                variance_je_id: varianceJeId
            };

        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    /**
     * Reopen Day (Owner Only)
     * Reverses closure and variance posting
     * 
     * @param {Date} date - Date to reopen
     * @param {String} type - 'Counter' or 'Float'
     * @param {Number} userId - User performing reopen
     * @param {String} reason - Reason for reopening
     * @returns {Promise<Object>} Reopen result
     */
    async reopenDay(date, type, userId, reason) {
        const client = await db.pool.connect();

        try {
            await client.query('BEGIN');

            // 1. Get balance with closure info
            const balanceRes = await client.query(`
                SELECT * FROM daily_balances 
                WHERE date = $1 AND type = $2
            `, [date, type]);

            if (balanceRes.rows.length === 0) {
                throw new Error(`Daily balance not found for ${date} (${type})`);
            }

            const balance = balanceRes.rows[0];

            if (balance.status !== 'Closed') {
                throw new Error(`Day ${date} (${type}) is not closed`);
            }

            // 2. If variance JE exists, reverse it
            if (balance.variance_je_id) {
                await JournalService.reverseJournalEntry(
                    balance.variance_je_id,
                    `Day reopened: ${reason}`,
                    new Date()
                );
            }

            // 3. Reopen day
            await client.query(`
                UPDATE daily_balances 
                SET status = 'Open',
                    closed_by = NULL,
                    closed_at = NULL,
                    variance_je_id = NULL,
                    reopen_count = reopen_count + 1
                WHERE date = $1 AND type = $2
            `, [date, type]);

            // 4. Audit log
            await client.query(`
                INSERT INTO audit_logs 
                (table_name, record_id, action, changed_by, metadata)
                VALUES ('daily_balances', $1, 'reopen_day', $2, $3)
            `, [balance.id, userId, JSON.stringify({
                reason,
                date,
                type,
                original_closure_at: balance.closed_at
            })]);

            await client.query('COMMIT');

            return {
                success: true,
                date: date,
                type: type,
                reopen_count: balance.reopen_count + 1,
                reason: reason
            };

        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }

    /**
     * Check if day is closed
     * 
     * @param {Date} date - Date to check
     * @param {String} type - 'Counter' or 'Float'
     * @returns {Promise<Boolean>} True if closed
     */
    async isDayClosed(date, type = 'Counter') {
        const result = await db.query(
            'SELECT is_day_closed($1, $2) as is_closed',
            [date, type]
        );

        return result.rows[0]?.is_closed || false;
    }

    /**
     * Get Daily Balance Summary
     * 
     * @param {Date} date - Date to get summary for
     * @param {String} type - 'Counter' or 'Float'
     * @returns {Promise<Object>} Daily balance summary
     */
    async getDailyBalanceSummary(date, type = 'Counter') {
        const balanceRes = await db.query(`
            SELECT db.*,
                   u.full_name as closed_by_name
            FROM daily_balances db
            LEFT JOIN users u ON db.closed_by = u.id
            WHERE db.date = $1 AND db.type = $2
        `, [date, type]);

        if (balanceRes.rows.length === 0) {
            // Create if doesn't exist
            await db.query(`
                INSERT INTO daily_balances (date, type, opening_balance, closing_balance, status)
                VALUES ($1, $2, 0, 0, 'Open')
                ON CONFLICT (date, type) DO NOTHING
            `, [date, type]);

            return {
                date: date,
                type: type,
                status: 'Open',
                opening_balance: 0,
                closing_balance: 0,
                actual_closing_balance: null,
                variance: 0
            };
        }

        const balance = balanceRes.rows[0];

        // Calculate expected closing from transactions
        const expectedRes = await this.calculateExpectedClosing(date, type);

        return {
            ...balance,
            expected_closing_calculated: expectedRes.closing_balance,
            variance: balance.actual_closing_balance
                ? parseFloat(balance.actual_closing_balance) - parseFloat(balance.closing_balance)
                : 0
        };
    }

    /**
     * Calculate Expected Closing Balance from Account Movements
     * 
     * @param {Date} date - Date to calculate for
     * @param {String} type - 'Counter' or 'Float'
     * @returns {Promise<Object>} Calculated balances
     */
    async calculateExpectedClosing(date, type = 'Counter') {
        const cashAccount = type === 'Counter' ? 1000 : 1030;

        // Get opening balance (closing of previous day)
        const prevDay = new Date(date);
        prevDay.setDate(prevDay.getDate() - 1);
        const prevDayStr = prevDay.toISOString().split('T')[0];

        const prevBalanceRes = await db.query(`
            SELECT actual_closing_balance
            FROM daily_balances
            WHERE date = $1 AND type = $2
        `, [prevDayStr, type]);

        const openingBalance = parseFloat(prevBalanceRes.rows[0]?.actual_closing_balance || 0);

        // Calculate movements for the day from journal entries
        const movementsRes = await db.query(`
            SELECT 
                COALESCE(SUM(ll.debit), 0) as total_debit,
                COALESCE(SUM(ll.credit), 0) as total_credit
            FROM ledger_lines ll
            JOIN journal_entries je ON ll.journal_entry_id = je.id
            WHERE ll.account_code = $1
              AND je.transaction_date = $2
        `, [cashAccount, date]);

        const totalDebit = parseFloat(movementsRes.rows[0]?.total_debit || 0);
        const totalCredit = parseFloat(movementsRes.rows[0]?.total_credit || 0);

        const closingBalance = openingBalance + totalDebit - totalCredit;

        return {
            opening_balance: openingBalance,
            total_debit: totalDebit,
            total_credit: totalCredit,
            closing_balance: closingBalance
        };
    }
}

module.exports = new ClosureService();
