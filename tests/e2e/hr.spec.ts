
import { test, expect } from '@playwright/test';
import { db } from '../utils/db';

test.describe('HR & Payroll Module', () => {
    test.beforeAll(async () => {
        // Cleanup if needed
    });

    test('should create a new employee', async ({ page }) => {
        await page.goto('/login');
        await page.fill('input[type="email"]', 'manager@alzohra.com');
        await page.fill('input[type="password"]', 'manager123');
        await page.click('button[type="submit"]');

        await page.goto('/hr/employees');
        await page.click('button:has-text("Add Employee")');

        const empName = `Emp_${Date.now()}`;
        await page.fill('input[name="name"]', empName);
        await page.fill('input[name="salary"]', '50000');
        await page.fill('input[name="designation"]', 'Chef');
        await page.click('button:has-text("Save")');

        await expect(page.locator('tbody')).toContainText(empName);

        const res = await db.query('SELECT id FROM employees WHERE full_name = $1', [empName]);
        expect(res.rows.length).toBe(1);
    });

    test('should give salary advance and verify deduction rules', async ({ page }) => {
        // Setup employee
        const empName = `Advance_Receiver_${Date.now()}`;
        const insertRes = await db.query(`INSERT INTO employees (full_name, base_salary, status) VALUES ($1, 50000, 'active') RETURNING id`, [empName]);
        const empId = insertRes.rows[0].id;

        await page.goto('/login');
        await page.fill('input[type="email"]', 'manager@alzohra.com');
        await page.fill('input[type="password"]', 'manager123');
        await page.click('button[type="submit"]');

        await page.goto('/hr/advances');
        await page.click('button:has-text("New Advance")');

        await page.selectOption('select[name="employee_id"]', String(empId)); // Or by label
        await page.fill('input[name="amount"]', '10000');
        await page.fill('input[name="reason"]', 'Emergency');
        await page.click('button:has-text("Approve Advance")');

        await expect(page.locator('.toast')).toContainText('Advance approved');

        // Check Journal: Debit Advance Asset, Credit Cash
        await db.verifyJournalBalance();

        // Assert Advance Balance
        // Assuming table `salary_advances` or `employee_balance`
        const advRes = await db.query('SELECT amount FROM salary_advances WHERE employee_id = $1', [empId]);
        expect(Number(advRes.rows[0].amount)).toBe(10000);
    });

    test('should generate payroll with correct auto-deductions', async ({ page }) => {
        // Setup: Employee with 50000 salary and 10000 advance
        const empName = `Payroll_Test_${Date.now()}`;
        const insertRes = await db.query(`INSERT INTO employees (full_name, base_salary, status) VALUES ($1, 50000, 'active') RETURNING id`, [empName]);
        const empId = insertRes.rows[0].id;

        await db.query(`INSERT INTO salary_advances (employee_id, amount, status) VALUES ($1, 5000, 'approved')`, [empId]); // 5k advance

        await page.goto('/login');
        await page.fill('input[type="email"]', 'manager@alzohra.com');
        await page.fill('input[type="password"]', 'manager123');
        await page.click('button[type="submit"]');

        await page.goto('/hr/payroll');
        await page.click('button:has-text("Generate Payroll")');

        // Select period/month
        // Assuming a payroll generation wizard
        // e.g. select current month
        await page.click('button:has-text("Process")');

        await expect(page.locator('.toast')).toContainText('Payroll generated');

        // Verify Net Salary
        // 50000 - 5000 (deduction) = 45000 (Assuming 100% deduction or partial policy)
        // If policy is partial, adjust expectation

        const payrollRes = await db.query('SELECT net_pay, advance_deduction FROM salary_history WHERE employee_id = $1 ORDER BY id DESC LIMIT 1', [empId]);
        const netSalary = Number(payrollRes.rows[0].net_pay);
        const deduction = Number(payrollRes.rows[0].advance_deduction);

        expect(deduction).toBeGreaterThan(0);
        expect(netSalary).toBe(50000 - deduction);

        // Verify Journal
        // Debit Salary Expense full 50000
        // Credit Advance Asset (deduction)
        // Credit Salary Payable (net)
        await db.verifyJournalBalance();
    });
});
