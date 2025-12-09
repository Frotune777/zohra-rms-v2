const db = require('../config/db');

// Get all advances (with employee names)
exports.getAllAdvances = async (req, res) => {
    const query = `
        SELECT al.*, e.full_name as employee_name, e.employee_code, e.role, e.department
        FROM advance_ledger al
        JOIN employees e ON al.employee_id = e.id
        ORDER BY al.transaction_date DESC
    `;
    try {
        const result = await db.query(query);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Get specific employee balance
exports.getEmployeeBalance = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(
            `SELECT 
                COALESCE(SUM(CASE WHEN transaction_type = 'Advance' THEN amount ELSE 0 END), 0) - 
                COALESCE(SUM(CASE WHEN transaction_type = 'Repayment' THEN amount ELSE 0 END), 0) as balance
             FROM advance_ledger WHERE employee_id = $1`,
            [id]
        );
        res.json({ balance: parseFloat(result.rows[0].balance) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Create new advance or repayment
exports.createTransaction = async (req, res) => {
    const { employeeId, type, amount, notes } = req.body;

    if (!employeeId || !type || !amount) {
        return res.status(400).json({ error: 'Employee, type, and amount are required' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        // 1. Calculate current balance
        const balRes = await client.query(
            `SELECT 
                COALESCE(SUM(CASE WHEN transaction_type = 'Advance' THEN amount ELSE 0 END), 0) - 
                COALESCE(SUM(CASE WHEN transaction_type = 'Repayment' THEN amount ELSE 0 END), 0) as balance
             FROM advance_ledger WHERE employee_id = $1`,
            [employeeId]
        );
        const currentBalance = parseFloat(balRes.rows[0].balance);

        let newBalance = currentBalance;
        if (type === 'Advance') {
            newBalance += parseFloat(amount);
        } else {
            newBalance -= parseFloat(amount);
        }

        // 2. Insert into Ledger
        await client.query(
            `INSERT INTO advance_ledger (employee_id, transaction_type, amount, balance_after, notes)
             VALUES ($1, $2, $3, $4, $5)`,
            [employeeId, type, parseFloat(amount), newBalance, notes]
        );

        // 3. General Ledger Entries (Double Entry)
        const jeRes = await client.query("INSERT INTO journal_entries (description) VALUES ($1) RETURNING id", [`Salary ${type} - Employee #${employeeId}`]);
        const jeId = jeRes.rows[0].id;

        if (type === 'Advance') {
            // Debit Employee Advances (Asset)
            await client.query("INSERT INTO ledger_lines (journal_entry_id, account_code, debit) VALUES ($1, 1100, $2)", [jeId, parseFloat(amount)]);
            // Credit Cash (Asset)
            await client.query("INSERT INTO ledger_lines (journal_entry_id, account_code, credit) VALUES ($1, 1000, $2)", [jeId, parseFloat(amount)]);
        } else {
            // Repayment
            // Debit Cash (Asset)
            await client.query("INSERT INTO ledger_lines (journal_entry_id, account_code, debit) VALUES ($1, 1000, $2)", [jeId, parseFloat(amount)]);
            // Credit Employee Advances (Asset)
            await client.query("INSERT INTO ledger_lines (journal_entry_id, account_code, credit) VALUES ($1, 1100, $2)", [jeId, parseFloat(amount)]);
        }

        await client.query('COMMIT');
        res.json({ success: true, newBalance });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};
