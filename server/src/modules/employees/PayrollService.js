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

        // 3. Financial Journaling (Using Domain Entity)
        if (netPay > 0) {
            const payrollJournal = new JournalEntry({
                date: new Date(),
                description: `Payroll ${month}/${year}: ${employee.full_name}`,
                reference_id: salaryHistoryId,
                reference_type: 'Payroll',
                lines: [
                    { account_code: 6000, debit: parseFloat(netPay.toFixed(2)), credit: 0 }, // Dr: Salaries Expense
                    { account_code: 1000, debit: 0, credit: parseFloat(netPay.toFixed(2)) }  // Cr: Cash
                ]
            });

            await JournalService.createJournalEntry(payrollJournal, client);
        }

        return { success: true, netPay, earnedSalary, salaryHistoryId };
    }
}

module.exports = new PayrollService();
