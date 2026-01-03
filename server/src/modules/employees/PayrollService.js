const db = require('../../config/db');
const JournalService = require('../finance/JournalService');
const JournalEntry = require('../finance/entities/JournalEntry');

class PayrollService {
    /**
     * Run Payroll for an employee
     * 
     * @param {Object} params - Payroll parameters
     * @param {Object} client - DB client
     */
    async runPayroll({ employeeId, month, year, daysWorked, manualAdjustment, adjustmentReason }, client) {
        const empRes = await client.query("SELECT * FROM employees WHERE id = $1", [employeeId]);
        const employee = empRes.rows[0];
        if (!employee) throw new Error('Employee not found');

        const baseSalary = parseFloat(employee.base_salary);
        const daysInMonth = new Date(year, month, 0).getDate();
        const worked = daysWorked || daysInMonth;

        const dailyRate = baseSalary / daysInMonth;
        const earnedSalary = dailyRate * worked;

        const adjustment = parseFloat(manualAdjustment || 0);
        const netPay = earnedSalary + adjustment;

        // 1. Insert/Update Salary History
        const historyRes = await client.query(
            `INSERT INTO salary_history 
            (employee_id, month, year, days_worked, total_days_in_month, calculated_salary, manual_adjustment, adjustment_reason, net_pay)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (employee_id, month, year) DO UPDATE SET
            days_worked = EXCLUDED.days_worked,
            calculated_salary = EXCLUDED.calculated_salary,
            manual_adjustment = EXCLUDED.manual_adjustment,
            net_pay = EXCLUDED.net_pay
            RETURNING id`,
            [employeeId, month, year, worked, daysInMonth, earnedSalary, adjustment, adjustmentReason, netPay]
        );
        const salaryHistoryId = historyRes.rows[0].id;

        // 2. Save components for reporting
        await client.query("DELETE FROM salary_history_components WHERE salary_history_id = $1", [salaryHistoryId]);
        await client.query(
            "INSERT INTO salary_history_components (salary_history_id, component_name, amount, type) VALUES ($1, 'Base Salary', $2, 'Earning')",
            [salaryHistoryId, earnedSalary]
        );
        if (adjustment !== 0) {
            await client.query(
                "INSERT INTO salary_history_components (salary_history_id, component_name, amount, type) VALUES ($1, $2, $3, $4)",
                [salaryHistoryId, adjustmentReason || 'Adjustment', Math.abs(adjustment), adjustment > 0 ? 'Earning' : 'Deduction']
            );
        }

        // 2.5 Check for Unsettled Wallet Balance (Float Sweep)
        let floatDeduction = 0;
        const userRes = await client.query('SELECT id, ledger_account_code FROM users WHERE employee_id = $1', [employeeId]);
        if (userRes.rows.length > 0) {
            const user = userRes.rows[0];
            if (user.ledger_account_code) {
                // Check balance
                const balRes = await client.query(`
                    SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) as balance 
                    FROM ledger_lines WHERE account_code = $1
                `, [user.ledger_account_code]);

                const currentBalance = parseFloat(balRes.rows[0].balance || 0);

                // If they hold cash (Positive Asset Balance), deduct it
                if (currentBalance > 0) {
                    floatDeduction = currentBalance;

                    // Add Float Deduction Component
                    await client.query(
                        "INSERT INTO salary_history_components (salary_history_id, component_name, amount, type) VALUES ($1, 'Unsettled Float Sweep', $2, 'Deduction')",
                        [salaryHistoryId, floatDeduction]
                    );

                    // Update Net Pay in history
                    // Original netPay passed adjustment, we need to subtract floatDeduction
                    const finalNetPay = netPay - floatDeduction;

                    await client.query(
                        "UPDATE salary_history SET net_pay = $1 WHERE id = $2",
                        [finalNetPay, salaryHistoryId]
                    );
                }
            }
        }

        // 3. Financial Journaling (Using Domain Entity)
        // Redefine netPay locally for journal
        const finalNetPay = netPay - floatDeduction;

        if (finalNetPay > 0 || floatDeduction > 0) {
            const journalLines = [
                { account_code: 6000, debit: parseFloat(netPay.toFixed(2)), credit: 0 } // Dr: Salaries Expense (Full Amount)
            ];

            if (floatDeduction > 0) {
                // Cr: Reduce Employee Wallet (Asset)
                journalLines.push({
                    account_code: userRes.rows[0].ledger_account_code,
                    debit: 0,
                    credit: parseFloat(floatDeduction.toFixed(2))
                });
            }

            if (finalNetPay > 0) {
                // Cr: Cash/Bank (Net Pay)
                journalLines.push({
                    account_code: 1000,
                    debit: 0,
                    credit: parseFloat(finalNetPay.toFixed(2))
                });
            }

            const payrollJournal = new JournalEntry({
                date: new Date(),
                description: `Payroll ${month}/${year}: ${employee.full_name}`,
                reference_id: salaryHistoryId,
                reference_type: 'Payroll',
                lines: journalLines
            });

            await JournalService.createJournalEntry(payrollJournal, client);
        }

        return { success: true, netPay, earnedSalary, salaryHistoryId };
    }
}

module.exports = new PayrollService();
