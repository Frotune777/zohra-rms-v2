const pool = require('../../config/db');

class TransactionService {
    /**
     * Create a new transaction
     * @param {Object} data - Transaction data
     */
    async createTransaction(data) {
        const {
            date,
            type,
            amount,
            payment_method,
            status,
            description,
            category_id,
            metadata,
            paid_by,
            paid_date,
            vendor_id,
            mode // New field: Cash, Bank, Bank_Cash
        } = data;

        const query = `
      INSERT INTO transactions 
      (date, type, amount, payment_method, status, description, category_id, metadata, paid_by, paid_date, vendor_id, mode)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `;

        const values = [
            date,
            type,
            amount,
            payment_method,
            status || 'Pending',
            description,
            category_id,
            metadata || {},
            paid_by,
            paid_date,
            vendor_id,
            mode
        ];

        const result = await pool.query(query, values);
        const transaction = result.rows[0];

        // ---------------------------------------------------------
        // P&L Synchronization (Create Journal Entry)
        // ---------------------------------------------------------
        // We only create JEs for actual P&L events (Income/Expense).
        // Bank_Cash Transfers are internal movements, handled separately or ignored by P&L.
        // If mode == 'Bank_Cash' AND type == 'Income', it's a transfer (Cash -> Float), not Revenue.

        const isTransfer = mode === 'Bank_Cash' && type === 'Sales'; // "Income" in UI for transfer
        const isFloatExpense = mode === 'Bank_Cash' && type === 'Expense'; // Manager spending float

        // P&L Logic:
        // 1. Sales (Income) -> Credit 4000 (Revenue), Debit 1100 (Cash/Bank)
        // 2. Expense -> Debit 6000 (Expense), Credit 1100 (Cash/Bank) or 2000 (Payable)

        if (!isTransfer) { // Normal P&L event OR Float Expense (which Is an expense)
            try {
                const jeDesc = `Tracker: ${description} (${type})`;
                const jeRes = await pool.query(
                    "INSERT INTO journal_entries (transaction_date, description) VALUES ($1, $2) RETURNING id",
                    [date, jeDesc]
                );
                const jeId = jeRes.rows[0].id; // FIXED from jeDesc.rows needed jeRes.rows

                if (type === 'Sales') {
                    // Credit Revenue (4000)
                    await pool.query("INSERT INTO ledger_lines (journal_entry_id, account_code, credit) VALUES ($1, 4000, $2)", [jeId, amount]);
                    // Debit Asset (1100) - Assuming Cash/Bank for now. Ideally split by mode.
                    await pool.query("INSERT INTO ledger_lines (journal_entry_id, account_code, debit) VALUES ($1, 1100, $2)", [jeId, amount]);
                } else if (type === 'Expense') {
                    // Debit Expense (6000)
                    await pool.query("INSERT INTO ledger_lines (journal_entry_id, account_code, debit) VALUES ($1, 6000, $2)", [jeId, amount]);

                    if (status === 'Pending' && vendor_id) {
                        // Credit Payable (2000 - or 5000 Vendor)
                        await pool.query("INSERT INTO ledger_lines (journal_entry_id, account_code, credit) VALUES ($1, 5000, $2)", [jeId, amount]);
                    } else {
                        // Credit Asset (1100) - Paid immediately
                        await pool.query("INSERT INTO ledger_lines (journal_entry_id, account_code, credit) VALUES ($1, 1100, $2)", [jeId, amount]);
                    }
                }
            } catch (err) {
                console.error("Failed to sync to P&L Ledger:", err);
                // Don't fail the transaction, just log. 
                // In production, we should probably use a transaction block for atomicity.
            }
        }

        // ---------------------------------------------------------
        // Vendor Ledger Integration
        // ---------------------------------------------------------
        if (type === 'Expense' && vendor_id) {

            // 1. Always record the "Bill" (Liability)
            // This increases the outstanding balance
            await pool.query(`
                INSERT INTO vendor_ledger 
                (supplier_id, date, transaction_type, amount, details, payment_mode, reference_number, created_at)
                VALUES ($1, $2, 'Bill', $3, $4, $5, $6, NOW())
            `, [
                vendor_id,
                date,
                amount,
                description || 'Daily Tracker Expense',
                'Credit', // Bills are usually Credit purchases initially
                `TRX-${transaction.id}`
            ]);

            // 2. If Status is "Paid", immediately record the "Payment"
            // This decreases the outstanding balance back down
            if (status === 'Paid') {
                // Ensure payment details are captured
                const payMode = payment_method || 'Cash';
                const payDetails = paid_by ? `Paid by ${paid_by}` : 'Paid via Daily Tracker';

                // Insert into vendor_payments (Official Payment Record)
                const paymentRes = await pool.query(`
                    INSERT INTO vendor_payments 
                    (vendor_id, amount, payment_mode, reference_number, notes, paid_by, payment_date, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                    RETURNING id
                `, [
                    vendor_id,
                    amount,
                    payMode,
                    `TRX-${transaction.id}`,
                    payDetails,
                    paid_by || 'Unknown',
                    paid_date || date
                ]);

                const paymentId = paymentRes.rows[0].id;

                // Insert into vendor_ledger as Payment
                await pool.query(`
                    INSERT INTO vendor_ledger 
                    (supplier_id, date, transaction_type, amount, details, payment_mode, reference_number, payment_id, created_at)
                    VALUES ($1, $2, 'Payment', $3, $4, $5, $6, $7, NOW())
                `, [
                    vendor_id,
                    paid_date || date,
                    amount,
                    payDetails,
                    payMode,
                    `TRX-${transaction.id}`,
                    paymentId
                ]);
            }
        }

        return transaction;
    }

    /**
     * Get transactions for a specific date or range
     * @param {Object} filters - Filter criteria
     */
    async getTransactions(filters = {}) {
        let query = `
            SELECT t.*, s.name as vendor_name, c.name as category_name
            FROM transactions t
            LEFT JOIN suppliers s ON t.vendor_id = s.id
            LEFT JOIN transaction_categories c ON t.category_id = c.id
            WHERE 1=1
        `;
        const values = [];
        let paramCount = 1;

        if (filters.date) {
            query += ` AND t.date = $${paramCount}`;
            values.push(filters.date);
            paramCount++;
        }

        if (filters.startDate && filters.endDate) {
            query += ` AND t.date BETWEEN $${paramCount} AND $${paramCount + 1}`;
            values.push(filters.startDate, filters.endDate);
            paramCount += 2;
        }

        if (filters.type) {
            query += ` AND t.type = $${paramCount}`;
            values.push(filters.type);
            paramCount++;
        }

        query += ` ORDER BY t.created_at DESC`;

        const result = await pool.query(query, values);
        return result.rows;
    }

    /**
     * Update a transaction
     */
    async updateTransaction(id, updates) {
        const allowedFields = ['date', 'type', 'amount', 'payment_method', 'status', 'description', 'category_id', 'metadata', 'paid_by', 'paid_date', 'vendor_id'];
        const values = [id];
        let paramCount = 2;
        const setClause = [];

        Object.keys(updates).forEach(key => {
            if (allowedFields.includes(key)) {
                setClause.push(`${key} = $${paramCount}`);
                values.push(updates[key]);
                paramCount++;
            }
        });

        if (setClause.length === 0) return null;

        const query = `
      UPDATE transactions
      SET ${setClause.join(', ')}, updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

        const result = await pool.query(query, values);
        const updatedTransaction = result.rows[0];

        // ---------------------------------------------------------
        // Vendor Ledger Integration (Update Flow)
        // ---------------------------------------------------------
        if (updatedTransaction.type === 'Expense' && updatedTransaction.vendor_id) {

            // Detect Status Change: Pending -> Paid
            // We assume the original transaction already created the "Bill".
            // Now we just need to record the "Payment".

            // Check if status changed to Paid (and wasn't before? We assume UI handles strict flow)
            // But safely, we can check if this specific update call set status to Paid
            if (updates.status === 'Paid') {

                const {
                    amount,
                    vendor_id,
                    payment_method,
                    paid_by,
                    paid_date,
                    date
                } = updatedTransaction;

                // Check if payment already exists for this reference (prevent duplicates)
                const checkRes = await pool.query(`
                    SELECT id FROM vendor_payments WHERE reference_number = $1
                `, [`TRX-${updatedTransaction.id}`]);

                if (checkRes.rows.length === 0) {
                    const payDetails = paid_by ? `Paid by ${paid_by}` : 'Paid via Daily Tracker Update';

                    // Insert into vendor_payments
                    const paymentRes = await pool.query(`
                        INSERT INTO vendor_payments 
                        (vendor_id, amount, payment_mode, reference_number, notes, paid_by, payment_date, created_at)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                        RETURNING id
                    `, [
                        vendor_id,
                        amount,
                        payment_method || 'Cash',
                        `TRX-${updatedTransaction.id}`,
                        payDetails,
                        paid_by || 'Unknown',
                        paid_date || date
                    ]);

                    const paymentId = paymentRes.rows[0].id;

                    // Insert into vendor_ledger as Payment
                    await pool.query(`
                        INSERT INTO vendor_ledger 
                        (supplier_id, date, transaction_type, amount, details, payment_mode, reference_number, payment_id, created_at)
                        VALUES ($1, $2, 'Payment', $3, $4, $5, $6, $7, NOW())
                    `, [
                        vendor_id,
                        paid_date || date,
                        amount,
                        payDetails,
                        payment_method || 'Cash',
                        `TRX-${updatedTransaction.id}`,
                        paymentId
                    ]);
                }
            }
        }

        return updatedTransaction;
    }

    /**
     * Delete a transaction
     */
    async deleteTransaction(id) {
        const query = 'DELETE FROM transactions WHERE id = $1 RETURNING id';
        const result = await pool.query(query, [id]);
        return result.rows[0];
    }

    /**
     * Get total sum by type for a date
     */
    async getSumByType(date, type) {
        const query = `
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM transactions 
      WHERE date = $1 AND type = $2
    `;
        const result = await pool.query(query, [date, type]);
        return parseFloat(result.rows[0].total);
    }

    /**
     * Get total sales by payment method for a date
     */
    async getSalesByMethod(date, method) {
        const query = `
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM transactions 
      WHERE date = $1 AND type = 'Sales' AND payment_method = $2
    `;
        const result = await pool.query(query, [date, method]);
        return parseFloat(result.rows[0].total);
    }

    /**
     * Get total expenses by payment method for a date
     */
    async getExpensesByMethod(date, method) {
        const query = `
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM transactions 
      WHERE date = $1 AND type = 'Expense' AND payment_method = $2
    `;
        const result = await pool.query(query, [date, method]);
        return parseFloat(result.rows[0].total);
    }

    async getPendingPayments(date) {
        const query = `
        SELECT COALESCE(SUM(amount), 0) as total
        FROM transactions
        WHERE date = $1 AND status = 'Pending'
      `;
        const result = await pool.query(query, [date]);
        return parseFloat(result.rows[0].total);
    }

    /**
     * Get transaction categories
     */
    async getCategories() {
        const query = 'SELECT * FROM transaction_categories ORDER BY type, name';
        const result = await pool.query(query);
        return result.rows;
    }
}


module.exports = new TransactionService();
