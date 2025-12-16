const db = require('../../config/db');

// Run Payroll (Idempotent Draft)
exports.runPayroll = async (req, res) => {
    const { month, year, employeeId, daysWorked, manualAdjustment, adjustmentReason, overtimeHours, overtimeAmount, extraDays, extraDayAmount } = req.body;
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Get employees (all or specific one)
        let query = 'SELECT * FROM employees WHERE status = \'active\'';
        let params = [];
        if (employeeId) {
            query += ' AND id = $1';
            params.push(employeeId);
        }
        const employees = await client.query(query, params);

        const payrollData = [];

        for (const emp of employees.rows) {
            const daysInMonth = new Date(year, month, 0).getDate();

            // 2. Calculate Days Worked from Attendance
            let effectiveDays = 0;

            // If manual daysWorked is provided in request, use it. Otherwise calculate from attendance.
            if (daysWorked !== undefined && employeeId) {
                // If running for single employee with manual override
                effectiveDays = daysWorked;
            } else {
                // Fetch attendance for this month
                const attendanceRes = await client.query(
                    `SELECT status FROM attendance 
                     WHERE employee_id = $1 
                     AND EXTRACT(MONTH FROM date) = $2 
                     AND EXTRACT(YEAR FROM date) = $3`,
                    [emp.id, month, year]
                );

                let attendanceDays = 0;
                attendanceRes.rows.forEach(r => {
                    if (r.status === 'Present') attendanceDays += 1;
                    else if (r.status === 'Half-Day') attendanceDays += 0.5;
                });

                // If no attendance records found, default to full month (legacy behavior) or 0?
                // Let's default to full month ONLY if no attendance system was used (count=0) AND it's not a specific request to use 0.
                // Actually, for safety, if 0 attendance records, we might want to default to daysInMonth to avoid 0 salaries for existing users.
                // BUT, if they started using attendance, this logic might be flawed.
                // Better approach: If attendance records exist (>0), use them. If 0, default to daysInMonth.
                effectiveDays = attendanceRes.rows.length > 0 ? attendanceDays : daysInMonth;

                // Override if manual daysWorked passed (e.g. from UI modal)
                if (daysWorked !== undefined && employeeId && parseInt(employeeId) === emp.id) {
                    effectiveDays = daysWorked;
                }
            }

            // 3. Salary Components & Base Calculation
            // Fetch Salary Structure
            const structureRes = await client.query(
                `SELECT sc.name, sc.type, ess.amount 
                 FROM employee_salary_structure ess
                 JOIN salary_components sc ON ess.component_id = sc.id
                 WHERE ess.employee_id = $1`,
                [emp.id]
            );

            let baseEarned = 0;
            let componentDeductions = 0;
            const proratedComponents = [];

            if (structureRes.rows.length > 0) {
                // Calculate based on components
                structureRes.rows.forEach(comp => {
                    const amount = parseFloat(comp.amount);
                    // Pro-rate all components based on attendance
                    const proratedAmount = (amount / daysInMonth) * effectiveDays;

                    if (comp.type === 'Earning') {
                        baseEarned += proratedAmount;
                    } else if (comp.type === 'Deduction') {
                        componentDeductions += proratedAmount;
                    }

                    proratedComponents.push({
                        name: comp.name,
                        type: comp.type,
                        amount: proratedAmount
                    });
                });
            } else {
                // Fallback to simple Base Salary
                const perDaySalary = parseFloat(emp.base_salary) / daysInMonth;
                baseEarned = perDaySalary * effectiveDays;

                proratedComponents.push({
                    name: 'Basic Salary',
                    type: 'Earning',
                    amount: baseEarned
                });
            }

            // 4. Overtime & Extra Days
            const otAmount = parseFloat(overtimeAmount || 0);
            const exDayAmount = parseFloat(extraDayAmount || 0);
            const manualAdj = parseFloat(manualAdjustment || 0);

            // 5. Get Outstanding Advance Balance
            const advanceBalanceRes = await client.query(`
                SELECT 
                    COALESCE(SUM(CASE WHEN transaction_type = 'Advance' THEN amount ELSE 0 END), 0) - 
                    COALESCE(SUM(CASE WHEN transaction_type = 'Repayment' THEN amount ELSE 0 END), 0) as outstanding_balance
                FROM advance_ledger 
                WHERE employee_id = $1
            `, [emp.id]);

            const outstandingBalance = parseFloat(advanceBalanceRes.rows[0].outstanding_balance || 0);

            // Determine deduction amount (Advance)
            let advanceDeduction = 0;
            if (outstandingBalance > 0) {
                if (req.body.advanceDeduction !== undefined && employeeId && parseInt(employeeId) === emp.id) {
                    advanceDeduction = parseFloat(req.body.advanceDeduction);
                    if (advanceDeduction > outstandingBalance) advanceDeduction = outstandingBalance;
                } else {
                    const grossPayChecker = baseEarned + otAmount + exDayAmount + manualAdj - componentDeductions;
                    // Cap deduction at available Net (before Advance)
                    const maxDeductible = Math.max(0, grossPayChecker);
                    advanceDeduction = Math.min(outstandingBalance, maxDeductible);
                }
            }

            // 6. Net Pay Calculation
            const grossPay = baseEarned + otAmount + exDayAmount + manualAdj;
            const netPay = Math.max(0, grossPay - componentDeductions - advanceDeduction);

            // 7. Upsert Salary History
            const existing = await client.query(
                'SELECT status FROM salary_history WHERE employee_id = $1 AND month = $2 AND year = $3',
                [emp.id, month, year]
            );

            if (existing.rows.length > 0 && existing.rows[0].status === 'Paid') {
                continue;
            }

            const historyRes = await client.query(
                `INSERT INTO salary_history 
                 (employee_id, month, year, days_worked, calculated_salary, advance_deduction, net_pay, status, allowances, deductions, overtime_hours, overtime_amount, extra_days, extra_day_amount)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, 'Pending', $8, $9, $10, $11, $12, $13)
                 ON CONFLICT (employee_id, month, year) 
                 DO UPDATE SET 
                    days_worked = EXCLUDED.days_worked,
                    calculated_salary = EXCLUDED.calculated_salary,
                    advance_deduction = EXCLUDED.advance_deduction,
                    net_pay = EXCLUDED.net_pay,
                    allowances = EXCLUDED.allowances,
                    deductions = EXCLUDED.deductions,
                    overtime_hours = EXCLUDED.overtime_hours,
                    overtime_amount = EXCLUDED.overtime_amount,
                    extra_days = EXCLUDED.extra_days,
                    extra_day_amount = EXCLUDED.extra_day_amount
                 RETURNING id, *`,
                [emp.id, month, year, effectiveDays, grossPay, advanceDeduction, netPay, '{}', componentDeductions ? { total: componentDeductions } : '{}', overtimeHours || 0, otAmount, extraDays || 0, exDayAmount]
            );

            const historyId = historyRes.rows[0].id;

            // 8. Save Components Breakdown (P1 Fix)
            // Clear existing components for this history if any (re-run scenario)
            await client.query('DELETE FROM salary_history_components WHERE salary_history_id = $1', [historyId]);

            for (const comp of proratedComponents) {
                await client.query(
                    `INSERT INTO salary_history_components (salary_history_id, component_name, amount, type)
                     VALUES ($1, $2, $3, $4)`,
                    [historyId, comp.name, comp.amount, comp.type]
                );
            }

            // Also add OT etc as components for clear view?
            if (otAmount > 0) {
                await client.query(`INSERT INTO salary_history_components (salary_history_id, component_name, amount, type) VALUES ($1, 'Overtime', $2, 'Earning')`, [historyId, otAmount]);
            }
            if (exDayAmount > 0) {
                await client.query(`INSERT INTO salary_history_components (salary_history_id, component_name, amount, type) VALUES ($1, 'Extra Days', $2, 'Earning')`, [historyId, exDayAmount]);
            }
            if (manualAdj !== 0) {
                const type = manualAdj > 0 ? 'Earning' : 'Deduction';
                await client.query(`INSERT INTO salary_history_components (salary_history_id, component_name, amount, type) VALUES ($1, 'Manual Adjustment', $2, $3)`, [historyId, Math.abs(manualAdj), type]);
            }
            if (componentDeductions > 0) {
                // Logic already added components, don't duplicate "Total Deductions"
            }
            if (advanceDeduction > 0) {
                await client.query(`INSERT INTO salary_history_components (salary_history_id, component_name, amount, type) VALUES ($1, 'Advance Recovery', $2, 'Deduction')`, [historyId, advanceDeduction, 'Deduction']);
            }

            const resultRow = historyRes.rows[0];
            resultRow.total_outstanding_advances = outstandingBalance;
            payrollData.push(resultRow);
        }

        await client.query('COMMIT');
        res.json({ success: true, data: payrollData });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};

// Get Monthly Payroll
exports.getMonthlyPayroll = async (req, res) => {
    const { month, year } = req.query;
    try {
        const result = await db.query(
            `SELECT sh.*, e.full_name, e.position, e.base_salary, e.bank_account_no, e.ifsc_code, e.department, e.employee_code, e.payout_method,
             (SELECT COALESCE(SUM(amount - COALESCE(recovered_amount, 0)), 0) FROM salary_advances sa WHERE sa.employee_id = e.id AND sa.is_recovered = FALSE) as total_outstanding_advances
             FROM salary_history sh
             JOIN employees e ON sh.employee_id = e.id
             WHERE sh.month = $1 AND sh.year = $2
             ORDER BY e.full_name`,
            [month, year]
        );
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Approve Payroll (Lock it)
exports.approvePayroll = async (req, res) => {
    const { id } = req.body; // salary_history id
    try {
        const result = await db.query(
            `UPDATE salary_history SET status = 'Approved' WHERE id = $1 AND status = 'Pending' RETURNING *`,
            [id]
        );
        res.json(result.rows[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Mark as Paid (Payout)
exports.markPaid = async (req, res) => {
    const { id, payment_mode, payment_date, paid_by } = req.body;
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Update Salary History
        const result = await client.query(
            `UPDATE salary_history 
             SET status = 'Paid', payment_mode = $2, payment_date = $3, paid_by = $4
             WHERE id = $1 AND status = 'Approved' 
             RETURNING *`,
            [id, payment_mode, payment_date || new Date(), paid_by]
        );

        if (result.rows.length === 0) {
            throw new Error('Record not found or not Approved');
        }

        const record = result.rows[0];

        // 2. Mark Advances as Recovered (Partial or Full)
        if (record.advance_deduction > 0) {
            let remainingDeduction = parseFloat(record.advance_deduction);
            const totalDeduction = remainingDeduction;

            // Get all unrecovered advances ordered by date (FIFO)
            const advancesQuery = `SELECT id, amount, recovered_amount FROM salary_advances 
                 WHERE employee_id = $1 AND is_recovered = FALSE 
                 ORDER BY created_at ASC`;
            const advancesRes = await client.query(advancesQuery, [record.employee_id]);

            for (const advance of advancesRes.rows) {
                if (remainingDeduction <= 0) break;

                const currentBalance = parseFloat(advance.amount) - parseFloat(advance.recovered_amount || 0);
                const deductionForThis = Math.min(currentBalance, remainingDeduction);

                const newRecoveredAmount = parseFloat(advance.recovered_amount || 0) + deductionForThis;
                const isFullyRecovered = newRecoveredAmount >= parseFloat(advance.amount);

                await client.query(
                    `UPDATE salary_advances 
                     SET recovered_amount = $1, is_recovered = $2 
                     WHERE id = $3`,
                    [newRecoveredAmount, isFullyRecovered, advance.id]
                );

                remainingDeduction -= deductionForThis;
            }

            // --- NEW: Insert into advance_ledger for history tracking ---
            // 1. Get current balance from advance_ledger
            const balRes = await client.query(
                `SELECT 
                    COALESCE(SUM(CASE WHEN transaction_type = 'Advance' THEN amount ELSE 0 END), 0) - 
                    COALESCE(SUM(CASE WHEN transaction_type = 'Repayment' THEN amount ELSE 0 END), 0) as balance
                 FROM advance_ledger WHERE employee_id = $1`,
                [record.employee_id]
            );
            const currentLedgerBalance = parseFloat(balRes.rows[0].balance || 0);
            const newLedgerBalance = currentLedgerBalance - totalDeduction;

            // 2. Insert Repayment Record
            await client.query(`
                INSERT INTO advance_ledger 
                (employee_id, transaction_type, amount, balance_after, notes, payment_mode, paid_by, transaction_date, repayment_source)
                VALUES ($1, 'Repayment', $2, $3, $4, 'Payroll Deduction', 'System', $5, 'Payroll')
            `, [record.employee_id, totalDeduction, newLedgerBalance, `Recovered from ${record.month}/${record.year} Payroll`, payment_date || new Date()]);
        }

        // 3. Add to General Ledger (Expense)

        // Using existing schema: journal_entries(transaction_date, description), ledger_lines(account_code)
        const journalRes = await client.query(
            `INSERT INTO journal_entries (transaction_date, description)
             VALUES ($1, $2) RETURNING id`,
            [payment_date || new Date(), `Payroll Payout - ${record.full_name || 'Employee'}`]
        );
        const journalId = journalRes.rows[0].id;

        // Debit: Salaries Expense (6000)
        await client.query(
            `INSERT INTO ledger_lines (journal_entry_id, account_code, debit, credit)
             VALUES ($1, 6000, $2, 0)`,
            [journalId, record.net_pay]
        );

        // Credit: Cash (1000) or Bank (1010)
        const creditAccountCode = payment_mode === 'Cash' ? 1000 : 1010;
        await client.query(
            `INSERT INTO ledger_lines (journal_entry_id, account_code, debit, credit)
             VALUES ($1, $2, 0, $3)`,
            [journalId, creditAccountCode, record.net_pay]
        );

        await client.query('COMMIT');
        res.json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};
