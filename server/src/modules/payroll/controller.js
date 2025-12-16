const db = require('../../config/db');

// Run Payroll (Idempotent Draft)
exports.runPayroll = async (req, res) => {
    const { month, year, employeeId, daysWorked, manualAdjustment, adjustmentReason, overtimeHours, overtimeAmount, extraDays, extraDayAmount } = req.body;
    console.log(`[Payroll] Starting runPayroll for month=${month}, year=${year}, employeeId=${employeeId}`);

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
        console.log(`[Payroll] Fetching employees: ${query} params=${JSON.stringify(params)}`);
        const employees = await client.query(query, params);
        console.log(`[Payroll] Found ${employees.rows.length} employees`);

        const payrollData = [];

        for (const emp of employees.rows) {
            console.log(`[Payroll] Processing employee ${emp.id} (${emp.full_name})`);
            const daysInMonth = new Date(year, month, 0).getDate();

            // 2. Calculate Days Worked from Attendance
            let effectiveDays = 0;

            if (daysWorked !== undefined && employeeId) {
                effectiveDays = daysWorked;
            } else {
                console.log(`[Payroll] Querying attendance for emp ${emp.id}`);
                const attendanceRes = await client.query(
                    `SELECT status FROM attendance 
                     WHERE employee_id = $1 
                     AND EXTRACT(MONTH FROM date) = $2 
                     AND EXTRACT(YEAR FROM date) = $3`,
                    [emp.id, month, year]
                );
                console.log(`[Payroll] Attendance records found: ${attendanceRes.rows.length}`);

                let attendanceDays = 0;
                attendanceRes.rows.forEach(r => {
                    if (r.status === 'Present') attendanceDays += 1;
                    else if (r.status === 'Half-Day') attendanceDays += 0.5;
                });

                effectiveDays = attendanceRes.rows.length > 0 ? attendanceDays : daysInMonth;

                if (daysWorked !== undefined && employeeId && parseInt(employeeId) === emp.id) {
                    effectiveDays = daysWorked;
                }
            }

            // 3. Salary Components & Base Calculation
            console.log(`[Payroll] Querying salary structure for emp ${emp.id}`);
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
                structureRes.rows.forEach(comp => {
                    const amount = parseFloat(comp.amount);
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
            console.log(`[Payroll] Querying advance/ledger for emp ${emp.id}`);
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
                    const maxDeductible = Math.max(0, grossPayChecker);
                    advanceDeduction = Math.min(outstandingBalance, maxDeductible);
                }
            }

            // 6. Net Pay Calculation
            const grossPay = baseEarned + otAmount + exDayAmount + manualAdj;
            const netPay = Math.max(0, grossPay - componentDeductions - advanceDeduction);

            // 7. Upsert Salary History
            console.log(`[Payroll] Checking existing history for emp ${emp.id}`);
            const existing = await client.query(
                'SELECT status FROM salary_history WHERE employee_id = $1 AND month = $2 AND year = $3',
                [emp.id, month, year]
            );

            if (existing.rows.length > 0 && existing.rows[0].status === 'Paid') {
                console.log(`[Payroll] Skipping emp ${emp.id} - Already Paid`);
                continue;
            }

            console.log(`[Payroll] Upserting history for emp ${emp.id}`);
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

            // 8. Save Components Breakdown
            console.log(`[Payroll] Saving components for history ${historyId}`);
            await client.query('DELETE FROM salary_history_components WHERE salary_history_id = $1', [historyId]);

            for (const comp of proratedComponents) {
                await client.query(
                    `INSERT INTO salary_history_components (salary_history_id, component_name, amount, type)
                     VALUES ($1, $2, $3, $4)`,
                    [historyId, comp.name, comp.amount, comp.type]
                );
            }

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
            if (advanceDeduction > 0) {
                await client.query(`INSERT INTO salary_history_components (salary_history_id, component_name, amount, type) VALUES ($1, 'Advance Recovery', $2, $3)`, [historyId, advanceDeduction, 'Deduction']);
            }

            const resultRow = historyRes.rows[0];
            resultRow.total_outstanding_advances = outstandingBalance;
            payrollData.push(resultRow);
        }

        console.log(`[Payroll] Committing transaction`);
        await client.query('COMMIT');
        res.json({ success: true, data: payrollData });
    } catch (err) {
        console.error('[Payroll] Error running payroll:', err);
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
            `SELECT sh.*, e.full_name, e.position, e.base_salary,
             (SELECT COALESCE(SUM(CASE WHEN transaction_type = 'Advance' THEN amount ELSE 0 END), 0) - 
                     COALESCE(SUM(CASE WHEN transaction_type = 'Repayment' THEN amount ELSE 0 END), 0)
              FROM advance_ledger 
              WHERE employee_id = e.id) as total_outstanding_advances
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
    console.log(`[Payroll] Marking paid: id=${id}, mode=${payment_mode}, date=${payment_date}, by=${paid_by}`);
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Update Salary History
        const result = await client.query(
            `UPDATE salary_history 
             SET status = 'Paid', payment_mode = $2, payment_date = $3, paid_by = $4
             WHERE id = $1 AND status = 'Approved' 
             RETURNING *`,
            [id, payment_mode, payment_date || new Date(), paid_by || null]
        );

        if (result.rows.length === 0) {
            throw new Error('Record not found or not Approved');
        }

        const record = result.rows[0];
        console.log(`[Payroll] Record updated: ${record.id}, advance_deduction=${record.advance_deduction}`);

        // 2. Mark Advances as Recovered (Partial or Full)
        if (record.advance_deduction > 0) {
            let remainingDeduction = parseFloat(record.advance_deduction);
            console.log(`[Payroll] Recovering advance: ${remainingDeduction}`);

            // Get all unrecovered advances ordered by date (FIFO)
            // Fix: Check column names - based on previous fixes, we might need to use proper columns
            // Let's debug query first
            const advancesQuery = `SELECT id, amount, recovered_amount FROM salary_advances 
                 WHERE employee_id = $1 AND is_recovered = FALSE 
                 ORDER BY created_at ASC`;
            console.log(`[Payroll] Fetching advances: ${advancesQuery} for emp ${record.employee_id}`);
            const advancesRes = await client.query(advancesQuery, [record.employee_id]);
            console.log(`[Payroll] Found ${advancesRes.rows.length} active advances`);

            for (const advance of advancesRes.rows) {
                if (remainingDeduction <= 0) break;

                const currentBalance = parseFloat(advance.amount) - parseFloat(advance.recovered_amount || 0);
                const deductionForThis = Math.min(currentBalance, remainingDeduction);
                console.log(`[Payroll] Advance ${advance.id}: balance=${currentBalance}, deducting=${deductionForThis}`);

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

            // --- Calculate new balance ---
            const balRes = await client.query(
                `SELECT 
                    COALESCE(SUM(CASE WHEN transaction_type = 'Advance' THEN amount ELSE 0 END), 0) - 
                    COALESCE(SUM(CASE WHEN transaction_type = 'Repayment' THEN amount ELSE 0 END), 0) as balance
                 FROM advance_ledger WHERE employee_id = $1`,
                [record.employee_id]
            );
            const currentLedgerBalance = parseFloat(balRes.rows[0].balance || 0);

            // Actually record.advance_deduction is the total deduction amount
            const finalBalance = currentLedgerBalance - parseFloat(record.advance_deduction);

            // 3. Insert Repayment Record
            console.log(`[Payroll] Inserting ledger entry. PrevBal=${currentLedgerBalance}, Ded=${record.advance_deduction}, NewBal=${finalBalance}`);
            await client.query(`
                INSERT INTO advance_ledger (employee_id, transaction_type, amount, transaction_date, notes, balance_after)
                VALUES ($1, 'Repayment', $2, $3, $4, $5)
            `, [record.employee_id, record.advance_deduction, payment_date || new Date(), `Payroll Deduction (ID: ${record.id})`, finalBalance]);
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

// Delete Payroll (Owner Only)
exports.deletePayroll = async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Get current record
        const recordRes = await client.query(
            'SELECT * FROM salary_history WHERE id = $1',
            [id]
        );

        if (recordRes.rows.length === 0) {
            throw new Error('Payroll record not found');
        }

        const payroll = recordRes.rows[0];

        // 2. If Paid, reverse financial transactions
        if (payroll.status === 'Paid') {
            // Reverse advance deductions in advance_ledger
            if (payroll.advance_deduction > 0) {
                const balRes = await client.query(
                    `SELECT COALESCE(SUM(CASE WHEN transaction_type = 'Advance' THEN amount ELSE 0 END), 0) - 
                            COALESCE(SUM(CASE WHEN transaction_type = 'Repayment' THEN amount ELSE 0 END), 0) as balance
                     FROM advance_ledger WHERE employee_id = $1`,
                    [payroll.employee_id]
                );
                const currentBalance = parseFloat(balRes.rows[0].balance || 0);
                const newBalance = currentBalance + parseFloat(payroll.advance_deduction);

                await client.query(`
                    INSERT INTO advance_ledger 
                    (employee_id, transaction_type, amount, balance_after, notes, repayment_source)
                    VALUES ($1, 'Advance', $2, $3, $4, 'Payroll Deletion Reversal')
                `, [
                    payroll.employee_id,
                    payroll.advance_deduction,
                    newBalance,
                    `Reversed from deleted payroll ${payroll.month}/${payroll.year} - Reason: ${reason}`
                ]);
            }

            // Mark journal entries as reversed
            await client.query(`
                UPDATE journal_entries 
                SET description = description || ' [REVERSED - Payroll Deleted]'
                WHERE description LIKE $1 AND transaction_date::date = $2::date
            `, [`Payroll Payout - %`, payroll.payment_date]);
        }

        // 3. Delete components
        await client.query(
            'DELETE FROM salary_history_components WHERE salary_history_id = $1',
            [id]
        );

        // 4. Delete salary history
        await client.query('DELETE FROM salary_history WHERE id = $1', [id]);

        // 5. Create audit log
        await client.query(`
            INSERT INTO payroll_audit_log 
            (salary_history_id, employee_id, action, previous_status, performed_by, reason, metadata)
            VALUES ($1, $2, 'delete', $3, $4, $5, $6)
        `, [
            id,
            payroll.employee_id,
            payroll.status,
            req.user.id,
            reason,
            JSON.stringify(payroll)
        ]);

        await client.query('COMMIT');
        res.json({ success: true, message: 'Payroll record deleted successfully' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};

// Revert Payroll (Owner Only)
exports.revertPayroll = async (req, res) => {
    const { id } = req.params;
    const { targetStatus, reason } = req.body; // 'Pending' or 'Approved'
    const client = await db.pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Get current record
        const recordRes = await client.query(
            'SELECT * FROM salary_history WHERE id = $1',
            [id]
        );

        if (recordRes.rows.length === 0) {
            throw new Error('Payroll record not found');
        }

        const payroll = recordRes.rows[0];

        // 2. Validate and perform transition
        if (payroll.status === 'Paid' && targetStatus === 'Approved') {
            // Reverse payment
            if (payroll.advance_deduction > 0) {
                // Reverse advance deduction in advance_ledger
                const balRes = await client.query(
                    `SELECT COALESCE(SUM(CASE WHEN transaction_type = 'Advance' THEN amount ELSE 0 END), 0) - 
                            COALESCE(SUM(CASE WHEN transaction_type = 'Repayment' THEN amount ELSE 0 END), 0) as balance
                     FROM advance_ledger WHERE employee_id = $1`,
                    [payroll.employee_id]
                );
                const currentBalance = parseFloat(balRes.rows[0].balance || 0);
                const newBalance = currentBalance + parseFloat(payroll.advance_deduction);

                await client.query(`
                    INSERT INTO advance_ledger 
                    (employee_id, transaction_type, amount, balance_after, notes, repayment_source)
                    VALUES ($1, 'Advance', $2, $3, $4, 'Payroll Payment Reversal')
                `, [
                    payroll.employee_id,
                    payroll.advance_deduction,
                    newBalance,
                    `Reversed from ${payroll.month}/${payroll.year} payroll revert - Reason: ${reason}`
                ]);
            }

            // Mark journal entries as reversed
            await client.query(`
                UPDATE journal_entries 
                SET description = description || ' [REVERSED - Payment Reverted]'
                WHERE description LIKE $1 AND transaction_date::date = $2::date
            `, [`Payroll Payout - %`, payroll.payment_date]);

            // Clear payment details and change status
            await client.query(`
                UPDATE salary_history 
                SET status = 'Approved', 
                    payment_mode = NULL, 
                    payment_date = NULL, 
                    paid_by = NULL
                WHERE id = $1
            `, [id]);

        } else if (payroll.status === 'Approved' && targetStatus === 'Pending') {
            // Simple status change
            await client.query(
                'UPDATE salary_history SET status = $1 WHERE id = $2',
                ['Pending', id]
            );
        } else {
            throw new Error(`Invalid status transition from ${payroll.status} to ${targetStatus}`);
        }

        // 3. Create audit log
        await client.query(`
            INSERT INTO payroll_audit_log 
            (salary_history_id, employee_id, action, previous_status, new_status, performed_by, reason)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
            id,
            payroll.employee_id,
            `revert_to_${targetStatus.toLowerCase()}`,
            payroll.status,
            targetStatus,
            req.user.id,
            reason
        ]);

        await client.query('COMMIT');
        res.json({ success: true, message: `Payroll reverted to ${targetStatus}` });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};
