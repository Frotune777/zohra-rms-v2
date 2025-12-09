const db = require('../../config/db');

exports.getPnL = async (req, res) => {
    const { month, year } = req.query;
    const currentDate = new Date();
    const queryMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
    const queryYear = year ? parseInt(year) : currentDate.getFullYear();

    try {
        // Get revenue for the month
        const revenueRes = await db.query(`
            SELECT COALESCE(SUM(credit) - SUM(debit), 0) as total 
            FROM ledger_lines l 
            JOIN chart_of_accounts c ON l.account_code = c.code 
            JOIN journal_entries je ON l.journal_entry_id = je.id
            WHERE c.type = 'Revenue' 
            AND EXTRACT(MONTH FROM je.transaction_date) = $1 
            AND EXTRACT(YEAR FROM je.transaction_date) = $2
        `, [queryMonth, queryYear]);

        // Get expenses for the month
        const expenseRes = await db.query(`
            SELECT COALESCE(SUM(debit) - SUM(credit), 0) as total 
            FROM ledger_lines l 
            JOIN chart_of_accounts c ON l.account_code = c.code 
            JOIN journal_entries je ON l.journal_entry_id = je.id
            WHERE c.type = 'Expense' 
            AND EXTRACT(MONTH FROM je.transaction_date) = $1 
            AND EXTRACT(YEAR FROM je.transaction_date) = $2
        `, [queryMonth, queryYear]);

        const revenue = parseFloat(revenueRes.rows[0].total || 0);
        const expenses = parseFloat(expenseRes.rows[0].total || 0);
        const profit = revenue - expenses;

        res.json({
            month: queryMonth,
            year: queryYear,
            revenue,
            expenses,
            profit
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getTransactions = async (req, res) => {
    const { month, year } = req.query;
    const currentDate = new Date();
    const queryMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
    const queryYear = year ? parseInt(year) : currentDate.getFullYear();

    try {
        const query = `
            SELECT je.id, je.description, je.transaction_date,
                   SUM(CASE WHEN ll.debit > 0 THEN ll.debit ELSE 0 END) as debit_total,
                   SUM(CASE WHEN ll.credit > 0 THEN ll.credit ELSE 0 END) as credit_total,
                   CASE 
                       WHEN c.type = 'Revenue' THEN 'Revenue'
                       WHEN c.type = 'Expense' THEN 'Expense'
                       ELSE c.type
                   END as transaction_type
            FROM journal_entries je
            LEFT JOIN ledger_lines ll ON je.id = ll.journal_entry_id
            LEFT JOIN chart_of_accounts c ON ll.account_code = c.code
            WHERE EXTRACT(MONTH FROM je.transaction_date) = $1 
            AND EXTRACT(YEAR FROM je.transaction_date) = $2
            GROUP BY je.id, je.description, je.transaction_date, c.type
            ORDER BY je.transaction_date DESC
        `;
        const result = await db.query(query, [queryMonth, queryYear]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.addRevenue = async (req, res) => {
    const { description, amount } = req.body;

    if (!description || !amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: 'Valid description and positive amount required' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const jeRes = await client.query(
            "INSERT INTO journal_entries (description) VALUES ($1) RETURNING id",
            [description]
        );
        const jeId = jeRes.rows[0].id;

        // Debit Cash (1000)
        await client.query(
            "INSERT INTO ledger_lines (journal_entry_id, account_code, debit) VALUES ($1, 1000, $2)",
            [jeId, parseFloat(amount)]
        );

        // Credit Revenue (4000)
        await client.query(
            "INSERT INTO ledger_lines (journal_entry_id, account_code, credit) VALUES ($1, 4000, $2)",
            [jeId, parseFloat(amount)]
        );

        await client.query('COMMIT');
        res.json({ success: true, message: 'Revenue entry added', jeId });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};

exports.addExpense = async (req, res) => {
    const { description, amount } = req.body;

    if (!description || !amount || parseFloat(amount) <= 0) {
        return res.status(400).json({ error: 'Valid description and positive amount required' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const jeRes = await client.query(
            "INSERT INTO journal_entries (description) VALUES ($1) RETURNING id",
            [description]
        );
        const jeId = jeRes.rows[0].id;

        // Debit Expense (6000)
        await client.query(
            "INSERT INTO ledger_lines (journal_entry_id, account_code, debit) VALUES ($1, 6000, $2)",
            [jeId, parseFloat(amount)]
        );

        // Credit Cash (1000)
        await client.query(
            "INSERT INTO ledger_lines (journal_entry_id, account_code, credit) VALUES ($1, 1000, $2)",
            [jeId, parseFloat(amount)]
        );

        await client.query('COMMIT');
        res.json({ success: true, message: 'Expense entry added', jeId });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};

exports.deleteTransaction = async (req, res) => {
    const { id } = req.params;

    try {
        await db.query('DELETE FROM ledger_lines WHERE journal_entry_id = $1', [id]);
        const result = await db.query('DELETE FROM journal_entries WHERE id = $1 RETURNING *', [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        res.json({ success: true, message: 'Transaction deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getDailySummary = async (req, res) => {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Date is required' });

    try {
        // 1. Sales (Revenue)
        const salesRes = await db.query(`
            SELECT COALESCE(SUM(credit), 0) as total
            FROM ledger_lines ll
            JOIN journal_entries je ON ll.journal_entry_id = je.id
            WHERE ll.account_code = 4000
            AND DATE(je.transaction_date) = $1
        `, [date]);

        // 2. Expenses
        const expenseRes = await db.query(`
            SELECT COALESCE(SUM(debit), 0) as total
            FROM ledger_lines ll
            JOIN journal_entries je ON ll.journal_entry_id = je.id
            WHERE (ll.account_code = 6000 OR ll.account_code = 5000)
            AND DATE(je.transaction_date) = $1
        `, [date]);

        // 3. Vendor Payments (from new vendor_payments table with mode breakdown)
        const vendorPaymentsRes = await db.query(`
            SELECT 
                payment_mode,
                COALESCE(SUM(amount), 0) as total,
                COUNT(*) as count
            FROM vendor_payments
            WHERE payment_date = $1
            GROUP BY payment_mode
        `, [date]);

        // Aggregate vendor payments by mode
        const vendorPayments = {
            total: 0,
            cash: 0,
            upi: 0,
            bank: 0,
            cheque: 0,
            breakdown: []
        };

        vendorPaymentsRes.rows.forEach(row => {
            const amount = parseFloat(row.total);
            vendorPayments.total += amount;
            vendorPayments.breakdown.push({
                mode: row.payment_mode,
                amount: amount,
                count: parseInt(row.count)
            });

            // Map to specific fields
            if (row.payment_mode === 'Cash') vendorPayments.cash = amount;
            else if (row.payment_mode === 'UPI') vendorPayments.upi = amount;
            else if (row.payment_mode === 'Bank Transfer') vendorPayments.bank = amount;
            else if (row.payment_mode === 'Cheque') vendorPayments.cheque = amount;
        });

        // 4. Salary Advances (Outflow)
        const advanceRes = await db.query(`
            SELECT 
                payment_mode,
                COALESCE(SUM(amount), 0) as total
            FROM advance_ledger
            WHERE transaction_type = 'Advance'
            AND DATE(transaction_date) = $1
            GROUP BY payment_mode
        `, [date]);

        const advances = {
            total: 0,
            cash: 0,
            upi: 0,
            bank: 0
        };

        advanceRes.rows.forEach(row => {
            const amount = parseFloat(row.total);
            advances.total += amount;
            if (row.payment_mode === 'Cash') advances.cash = amount;
            else if (row.payment_mode === 'UPI') advances.upi = amount;
            else if (row.payment_mode === 'Bank Transfer') advances.bank = amount;
        });

        const sales = parseFloat(salesRes.rows[0].total);
        const expenses = parseFloat(expenseRes.rows[0].total);

        // Calculate cash flow by mode
        const cashFlow = {
            cash: sales - vendorPayments.cash - advances.cash,
            upi: -vendorPayments.upi - advances.upi,
            bank: -vendorPayments.bank - advances.bank,
            total: sales - expenses - vendorPayments.total - advances.total
        };

        res.json({
            date,
            sales,
            expenses,
            vendor_payments: vendorPayments,
            salary_advances: advances,
            cash_flow: cashFlow,
            net_cash_flow: cashFlow.total
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.recordPayment = async (req, res) => {
    const { supplierId, amount, paymentMode, details } = req.body;

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Add to Vendor Ledger
        await client.query(
            `INSERT INTO vendor_ledger (date, supplier_id, transaction_type, amount, details)
             VALUES (CURRENT_DATE, $1, 'Payment', $2, $3)`,
            [supplierId, -parseFloat(amount), `Payment via ${paymentMode}: ${details}`]
        );

        // 2. General Ledger Entry
        const jeRes = await client.query("INSERT INTO journal_entries (description) VALUES ($1) RETURNING id", [`Vendor Payment: ${details}`]);
        const jeId = jeRes.rows[0].id;

        // Debit Expense/Liability (5000)
        await client.query("INSERT INTO ledger_lines (journal_entry_id, account_code, debit) VALUES ($1, 5000, $2)", [jeId, parseFloat(amount)]);

        // Credit Cash (1000)
        await client.query("INSERT INTO ledger_lines (journal_entry_id, account_code, credit) VALUES ($1, 1000, $2)", [jeId, parseFloat(amount)]);

        await client.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};
