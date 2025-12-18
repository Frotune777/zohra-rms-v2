/**
 * JournalService - Core Double-Entry Accounting Module
 * 
 * Purpose: Centralized, validated journal entry creation
 * All financial transactions MUST flow through this service
 * 
 * @module JournalService
 */

const db = require('../../config/db');

class JournalService {
    /**
     * Create Journal Entry with Balanced Lines
     * This is the ONLY way to create journal entries in the system
     * 
     * @param {Object} entry - Journal entry details
     * @param {Date} entry.date - Transaction date
     * @param {String} entry.description - Human-readable description
     * @param {Number} entry.reference_id - Optional ID linking to source record
     * @param {String} entry.reference_type - Type of source (Expense, Sale, Payment, etc)
     * @param {Array} entry.lines - Array of ledger lines
     * @param {Number} entry.lines[].account_code - GL account code
     * @param {Number} entry.lines[].debit - Debit amount (0 if credit)
     * @param {Number} entry.lines[].credit - Credit amount (0 if debit)
     * @param {Object} client - Optional DB client for transaction management
     * @returns {Promise<Object>} Created journal entry with ID
     * @throws {Error} If entry is unbalanced, period is locked, or validation fails
     */
    async createJournalEntry(entry, client = null) {
        const shouldManageTransaction = !client;
        const dbClient = client || await db.pool.connect();

        try {
            if (shouldManageTransaction) {
                await dbClient.query('BEGIN');
            }

            // 1. Validate entry structure
            if (!entry.date) {
                throw new Error('Journal entry date is required');
            }

            if (!entry.description) {
                throw new Error('Journal entry description is required');
            }

            if (!entry.lines || entry.lines.length < 2) {
                throw new Error('Journal entry must have at least 2 lines');
            }

            // 2. Validate balanced entry (CRITICAL)
            const totalDebit = entry.lines.reduce((sum, line) => {
                return sum + parseFloat(line.debit || 0);
            }, 0);

            const totalCredit = entry.lines.reduce((sum, line) => {
                return sum + parseFloat(line.credit || 0);
            }, 0);

            if (Math.abs(totalDebit - totalCredit) > 0.01) {
                throw new Error(
                    `Unbalanced entry: Dr ${totalDebit.toFixed(2)} != Cr ${totalCredit.toFixed(2)} ` +
                    `(Imbalance: ${(totalDebit - totalCredit).toFixed(2)})`
                );
            }

            // 3. Validate all account codes exist
            for (const line of entry.lines) {
                const accountCheck = await dbClient.query(
                    'SELECT code, name FROM chart_of_accounts WHERE code = $1',
                    [line.account_code]
                );

                if (accountCheck.rows.length === 0) {
                    throw new Error(`Invalid account code: ${line.account_code}`);
                }
            }

            // 4. Check period locking (enforced at DB level via trigger, but check here for better error message)
            const periodCheck = await dbClient.query(
                'SELECT get_period_status($1) as status',
                [entry.date]
            );

            const periodStatus = periodCheck.rows[0]?.status;
            if (periodStatus && periodStatus !== 'Open') {
                throw new Error(`Cannot create journal entry: Financial period for ${entry.date} is ${periodStatus}`);
            }

            // 5. Insert journal entry header
            const jeRes = await dbClient.query(`
                INSERT INTO journal_entries (transaction_date, description, reference_id, reference_type)
                VALUES ($1, $2, $3, $4) 
                RETURNING id
            `, [
                entry.date,
                entry.description,
                entry.reference_id || null,
                entry.reference_type || null
            ]);

            const jeId = jeRes.rows[0].id;

            // 6. Insert ledger lines
            for (const line of entry.lines) {
                const debit = parseFloat(line.debit || 0);
                const credit = parseFloat(line.credit || 0);

                // Skip zero lines (but allow if explicitly set)
                if (debit === 0 && credit === 0) {
                    continue;
                }

                await dbClient.query(`
                    INSERT INTO ledger_lines (journal_entry_id, account_code, debit, credit)
                    VALUES ($1, $2, $3, $4)
                `, [jeId, line.account_code, debit, credit]);
            }

            if (shouldManageTransaction) {
                await dbClient.query('COMMIT');
            }

            return {
                id: jeId,
                date: entry.date,
                description: entry.description,
                total_debit: totalDebit,
                total_credit: totalCredit
            };

        } catch (err) {
            if (shouldManageTransaction) {
                await dbClient.query('ROLLBACK');
            }
            throw err;
        } finally {
            if (shouldManageTransaction) {
                dbClient.release();
            }
        }
    }

    /**
     * Get Account Balance as of Date
     * 
     * @param {Number} accountCode - GL account code
     * @param {Date} asOfDate - Optional cutoff date
     * @returns {Promise<Number>} Account balance
     */
    async getAccountBalance(accountCode, asOfDate = null) {
        const query = `
            SELECT 
                COALESCE(SUM(ll.debit), 0) - COALESCE(SUM(ll.credit), 0) as balance,
                ca.type as account_type
            FROM chart_of_accounts ca
            LEFT JOIN ledger_lines ll ON ca.code = ll.account_code
            LEFT JOIN journal_entries je ON ll.journal_entry_id = je.id
            WHERE ca.code = $1
            ${asOfDate ? 'AND je.transaction_date <= $2' : ''}
            GROUP BY ca.code, ca.type
        `;

        const params = asOfDate ? [accountCode, asOfDate] : [accountCode];
        const result = await db.query(query, params);

        if (result.rows.length === 0) {
            throw new Error(`Account code ${accountCode} not found`);
        }

        const balance = parseFloat(result.rows[0]?.balance || 0);
        const accountType = result.rows[0]?.account_type;

        // Return signed balance based on account type
        // Assets & Expenses: Debit positive
        // Liabilities & Revenue: Credit positive (so negate)
        if (accountType === 'Liability' || accountType === 'Revenue') {
            return -balance;
        }

        return balance;
    }

    /**
     * Get Journal Entry by ID
     * 
     * @param {String|Number} jeId - Journal entry ID
     * @returns {Promise<Object>} Journal entry with lines
     */
    async getJournalEntry(jeId) {
        const entryRes = await db.query(`
            SELECT * FROM journal_entries WHERE id = $1
        `, [jeId]);

        if (entryRes.rows.length === 0) {
            throw new Error(`Journal entry ${jeId} not found`);
        }

        const entry = entryRes.rows[0];

        const linesRes = await db.query(`
            SELECT ll.*, ca.name as account_name, ca.type as account_type
            FROM ledger_lines ll
            JOIN chart_of_accounts ca ON ll.account_code = ca.code
            WHERE ll.journal_entry_id = $1
            ORDER BY ll.id
        `, [jeId]);

        entry.lines = linesRes.rows;

        return entry;
    }

    /**
     * Reverse Journal Entry (Creates a reversing entry)
     * Used for corrections, not for normal operations
     * 
     * @param {String|Number} jeId - Journal entry to reverse
     * @param {String} reason - Reason for reversal
     * @param {Date} reversalDate - Date for reversal entry
     * @returns {Promise<Object>} New reversing journal entry
     */
    async reverseJournalEntry(jeId, reason, reversalDate = new Date()) {
        const originalEntry = await this.getJournalEntry(jeId);

        // Create reversed lines (swap debit/credit)
        const reversedLines = originalEntry.lines.map(line => ({
            account_code: line.account_code,
            debit: line.credit, // Swap
            credit: line.debit  // Swap
        }));

        const reversalEntry = {
            date: reversalDate,
            description: `REVERSAL: ${originalEntry.description} | Reason: ${reason}`,
            reference_id: originalEntry.id,
            reference_type: 'Reversal',
            lines: reversedLines
        };

        return await this.createJournalEntry(reversalEntry);
    }
}

module.exports = new JournalService();
