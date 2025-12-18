const db = require('../../config/db');

// --- Employee Management ---

exports.getEmployees = async (req, res) => {
    try {
        let query = 'SELECT * FROM employees ORDER BY full_name';

        const result = await db.query(query);

        let employees = result.rows;
        if (req.user.role === 'staff') {
            employees = employees.map(emp => ({
                ...emp,
                base_salary: null
            }));
        }

        res.json(employees);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.createEmployee = async (req, res) => {
    try {
        const { full_name, first_name, last_name, position, age, gender, phone_number, base_salary, status, role, govt_id_type, govt_id_number } = req.body;

        if (!full_name || !position || !base_salary) {
            return res.status(400).json({ error: 'Full name, position, and salary are required' });
        }

        // Generate Employee Code
        const maxIdRes = await db.query('SELECT MAX(id) as max_id FROM employees');
        const nextId = (parseInt(maxIdRes.rows[0].max_id) || 0) + 1;
        const employee_code = `EMP${String(nextId).padStart(3, '0')}`;

        const result = await db.query(
            `INSERT INTO employees 
            (full_name, first_name, last_name, position, age, gender, phone_number, base_salary, status, role, employee_code, govt_id_type, govt_id_number) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) 
            RETURNING *`,
            [full_name, first_name, last_name, position, age || null, gender || null, phone_number || null, base_salary, status || 'active', role || 'staff', employee_code, govt_id_type || null, govt_id_number || null]
        );

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('DEBUG: createEmployee Error:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.updateEmployee = async (req, res) => {
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        const { id } = req.params;
        const { full_name, first_name, last_name, position, age, gender, phone_number, base_salary, status, role, govt_id_type, govt_id_number } = req.body;
        const changedBy = req.user.email;

        const currentRes = await client.query('SELECT * FROM employees WHERE id = $1', [id]);
        if (currentRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Employee not found' });
        }
        const current = currentRes.rows[0];

        const result = await client.query(
            `UPDATE employees SET 
            full_name = COALESCE($1, full_name), 
            first_name = COALESCE($2, first_name), 
            last_name = COALESCE($3, last_name), 
            position = COALESCE($4, position), 
            age = COALESCE($5, age), 
            gender = COALESCE($6, gender), 
            phone_number = COALESCE($7, phone_number), 
            base_salary = COALESCE($8, base_salary), 
            status = COALESCE($9, status),
            role = COALESCE($10, role),
            govt_id_type = COALESCE($11, govt_id_type),
            govt_id_number = COALESCE($12, govt_id_number)
            WHERE id = $13 RETURNING *`,
            [full_name || null, first_name || null, last_name || null, position || null, age || null, gender || null, phone_number || null, base_salary || null, status || null, role || null, govt_id_type || null, govt_id_number || null, id]
        );
        const updated = result.rows[0];

        const fieldsToCheck = ['base_salary', 'position', 'role', 'status'];
        for (const field of fieldsToCheck) {
            if (req.body[field] !== undefined && req.body[field] != current[field]) {
                await client.query(
                    'INSERT INTO employee_history (employee_id, field_changed, old_value, new_value, changed_by) VALUES ($1, $2, $3, $4, $5)',
                    [id, field, current[field], req.body[field], changedBy]
                );
            }
        }

        await client.query('COMMIT');
        res.json(updated);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};

exports.deleteEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await db.query('DELETE FROM employees WHERE id = $1 RETURNING id', [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        res.json({ success: true, message: 'Employee deleted' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getEmployeeHistory = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await db.query(
            'SELECT * FROM employee_history WHERE employee_id = $1 ORDER BY changed_at DESC',
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- Attendance ---

exports.getAttendance = async (req, res) => {
    const { date } = req.query;
    try {
        const result = await db.query(
            `SELECT a.*, e.full_name 
             FROM employees e
             LEFT JOIN attendance a ON e.id = a.employee_id AND a.date = $1
             WHERE e.status = 'active'
             ORDER BY e.full_name`,
            [date]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.saveBulkAttendance = async (req, res) => {
    const { date, records } = req.body;

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');
        for (const record of records) {
            await client.query(
                `INSERT INTO attendance (date, employee_id, status)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (date, employee_id) DO UPDATE
                 SET status = EXCLUDED.status`,
                [date, record.employee_id, record.status]
            );
        }
        await client.query('COMMIT');
        res.json({ success: true, message: 'Attendance saved' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};

// --- Payroll & Advances ---

exports.getAllAdvances = async (req, res) => {
    const query = `
        SELECT al.*, e.full_name as employee_name, e.employee_code, e.role
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

exports.getEmployeeAdvanceHistory = async (req, res) => {
    const { id } = req.params;
    const query = `
        SELECT al.*, e.full_name as employee_name, e.employee_code, e.role
        FROM advance_ledger al
        JOIN employees e ON al.employee_id = e.id
        ORDER BY al.transaction_date DESC
    `;
    try {
        const result = await db.query(query, [id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

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

exports.createTransaction = async (req, res) => {
    const { employeeId, type, amount, notes, paymentMode, paidBy } = req.body;
    const userId = req.user.id;

    // Basic validation
    if (!employeeId || !type || !amount) {
        return res.status(400).json({ error: 'Employee, type, and amount are required' });
    }

    if (parseFloat(amount) <= 0) {
        return res.status(400).json({ error: 'Amount must be greater than 0' });
    }

    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        // Insert into advance_requests
        const result = await client.query(`
            INSERT INTO advance_requests 
            (employee_id, type, requested_amount, reason, payment_mode, paid_by, requested_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *
        `, [
            employeeId,
            type,
            parseFloat(amount),
            notes,
            paymentMode || 'Cash',
            paidBy,
            userId
        ]);

        await client.query('COMMIT');
        res.json({ success: true, message: 'Request submitted for approval', request: result.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};

exports.getAdvanceRequests = async (req, res) => {
    try {
        const query = `
            SELECT ar.*, ar.requested_amount as amount, e.full_name as employee_name, e.employee_code, e.role, u.full_name as requester_name
            FROM advance_requests ar
            JOIN employees e ON ar.employee_id = e.id
            LEFT JOIN users u ON ar.requested_by = u.id
            ORDER BY 
                CASE WHEN ar.status = 'Pending' THEN 1 ELSE 2 END,
                ar.requested_at DESC
        `;
        const result = await db.query(query);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.approveAdvance = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // Load required services
        const JournalService = require('../finance/JournalService');
        const PaymentModeService = require('../finance/PaymentModeService');

        // 1. Get request details
        const reqRes = await client.query('SELECT * FROM advance_requests WHERE id = $1 FOR UPDATE', [id]);
        if (reqRes.rows.length === 0) throw new Error('Request not found');
        const request = reqRes.rows[0];

        if (request.status !== 'Pending') throw new Error('Request already processed');

        // 2. Calculate Balance Logic
        const balRes = await client.query(`
            SELECT 
                COALESCE(SUM(CASE WHEN transaction_type = 'Advance' THEN amount ELSE 0 END), 0) - 
                COALESCE(SUM(CASE WHEN transaction_type = 'Repayment' THEN amount ELSE 0 END), 0) as balance
             FROM advance_ledger WHERE employee_id = $1
        `, [request.employee_id]);
        const currentBalance = parseFloat(balRes.rows[0].balance || 0);

        if (request.type === 'Repayment' && parseFloat(request.requested_amount) > currentBalance) {
            throw new Error(`Repayment amount exceeds outstanding balance (₹${currentBalance})`);
        }

        let newBalance = currentBalance;
        if (request.type === 'Advance') {
            newBalance += parseFloat(request.requested_amount);
        } else {
            newBalance -= parseFloat(request.requested_amount);
        }

        // 3. Get payment mode account mapping
        const cashAccount = await PaymentModeService.getAccountCode(request.payment_mode || 'cash');

        // 4. Create Journal Entry (REFACTORED)
        const journalEntry = {
            date: new Date(),
            description: `Salary ${request.type} - ${request.reason}`,
            reference_id: id,
            reference_type: `Advance${request.type}`,
            lines: request.type === 'Advance' ? [
                { account_code: 1100, debit: parseFloat(request.requested_amount), credit: 0 }, // Dr: Advance Receivable
                { account_code: cashAccount, debit: 0, credit: parseFloat(request.requested_amount) } // Cr: Cash/Bank
            ] : [
                { account_code: cashAccount, debit: parseFloat(request.requested_amount), credit: 0 }, // Dr: Cash/Bank
                { account_code: 1100, debit: 0, credit: parseFloat(request.requested_amount) } // Cr: Advance Receivable
            ]
        };

        const je = await JournalService.createJournalEntry(journalEntry, client);

        // 5. Insert into Ledger (with journal entry reference)
        const ledgerRes = await client.query(`
            INSERT INTO advance_ledger 
            (employee_id, transaction_type, amount, balance_after, notes, payment_mode, paid_by, advance_request_id, approved_by, approved_at, journal_entry_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), $10)
            RETURNING *
        `, [
            request.employee_id,
            request.type,
            request.requested_amount,
            newBalance,
            request.reason,
            request.payment_mode,
            request.paid_by,
            id,
            userId,
            je.id
        ]);

        // 6. Update Request Status
        await client.query(`
            UPDATE advance_requests 
            SET status = 'Approved', approved_by = $1, approved_at = NOW() 
            WHERE id = $2
        `, [userId, id]);

        await client.query('COMMIT');
        res.json({
            success: true,
            message: 'Approved successfully',
            journal_entry_id: je.id,
            ledger_entry: ledgerRes.rows[0]
        });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};


exports.rejectAdvance = async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user.id;

    try {
        await db.query(`
            UPDATE advance_requests 
            SET status = 'Rejected', approved_by = $1, approved_at = NOW(), rejection_reason = $2
            WHERE id = $3
        `, [userId, reason, id]);
        res.json({ success: true, message: 'Request rejected' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.runPayroll = async (req, res) => {
    const { employeeId, month, year, daysWorked, manualAdjustment, adjustmentReason } = req.body;
    const client = await db.pool.connect();
    try {
        await client.query('BEGIN');

        const empRes = await client.query("SELECT * FROM employees WHERE id = $1", [employeeId]);
        console.log('DEBUG: runPayroll empRes rows:', empRes.rows);
        const employee = empRes.rows[0];
        const baseSalary = parseFloat(employee.base_salary);

        const daysInMonth = new Date(year, month, 0).getDate();
        const worked = daysWorked || daysInMonth;

        const dailyRate = baseSalary / daysInMonth;
        const earnedSalary = dailyRate * worked;

        const adjustment = parseFloat(manualAdjustment || 0);
        const netPay = earnedSalary + adjustment;

        await client.query(
            `INSERT INTO salary_history 
            (employee_id, month, year, days_worked, total_days_in_month, calculated_salary, manual_adjustment, adjustment_reason, net_pay)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (employee_id, month, year) DO UPDATE SET
            days_worked = EXCLUDED.days_worked,
            calculated_salary = EXCLUDED.calculated_salary,
            manual_adjustment = EXCLUDED.manual_adjustment,
            net_pay = EXCLUDED.net_pay`,
            [employeeId, month, year, worked, daysInMonth, earnedSalary, adjustment, adjustmentReason, netPay]
        );

        const jeRes = await client.query("INSERT INTO journal_entries (description) VALUES ($1) RETURNING id", [`Payroll ${month}/${year}: ${employee.full_name}`]);
        const jeId = jeRes.rows[0].id;

        await client.query("INSERT INTO ledger_lines (journal_entry_id, account_code, debit) VALUES ($1, 6000, $2)", [jeId, netPay]);
        await client.query("INSERT INTO ledger_lines (journal_entry_id, account_code, credit) VALUES ($1, 1000, $2)", [jeId, netPay]);

        await client.query('COMMIT');
        res.json({ success: true, netPay, earnedSalary });
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
};

exports.getMonthlyPayroll = async (req, res) => {
    const { month, year } = req.query;
    const currentDate = new Date();
    const queryMonth = month || currentDate.getMonth() + 1;
    const queryYear = year || currentDate.getFullYear();

    try {
        const query = `
            SELECT 
                e.id,
                e.full_name,
                e.position,
                e.base_salary,
                COALESCE(sh.days_worked, 0) as days_worked,
                COALESCE(sh.calculated_salary, e.base_salary) as calculated_salary,
                COALESCE(sh.manual_adjustment, 0) as manual_adjustment,
                sh.adjustment_reason,
                COALESCE(sh.net_pay, e.base_salary) as net_pay,
                (
                    SELECT COALESCE(SUM(CASE WHEN transaction_type = 'Advance' THEN amount ELSE 0 END), 0) - 
                           COALESCE(SUM(CASE WHEN transaction_type = 'Repayment' THEN amount ELSE 0 END), 0)
                    FROM advance_ledger al 
                    WHERE al.employee_id = e.id
                ) as active_advances
            FROM employees e
            LEFT JOIN salary_history sh ON e.id = sh.employee_id AND sh.month = $1 AND sh.year = $2
            WHERE e.status = 'active'
            ORDER BY e.full_name
        `;
        const result = await db.query(query, [queryMonth, queryYear]);
        res.json({ month: queryMonth, year: queryYear, data: result.rows });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getEmployeesWithAdvances = async (req, res) => {
    const query = `
        SELECT e.*, 
        (COALESCE(SUM(CASE WHEN al.transaction_type = 'Advance' THEN al.amount ELSE 0 END), 0) - 
         COALESCE(SUM(CASE WHEN al.transaction_type = 'Repayment' THEN al.amount ELSE 0 END), 0)) as active_advances
        FROM employees e
        LEFT JOIN advance_ledger al ON e.id = al.employee_id
        GROUP BY e.id
        ORDER BY e.full_name
    `;
    try {
        const result = await db.query(query);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
