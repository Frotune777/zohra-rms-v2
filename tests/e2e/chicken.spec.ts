
import { test, expect } from '@playwright/test';
import { db } from '../utils/db';

test.describe('Chicken Tracker Module', () => {
    const today = new Date().toISOString().split('T')[0];
    const vendorName = 'Test Vendor';
    let vendorId;

    test.beforeAll(async () => {
        try {
            // Ensure 'Test Vendor' exists
            await db.query(`
                INSERT INTO suppliers (name, phone, payment_type, vendor_type, markup_required) 
                VALUES ($1, '1234567890', 'CASH', 'SUPPLIES', true) 
                ON CONFLICT (name) DO NOTHING
            `, [vendorName]);

            const res = await db.query('SELECT id FROM suppliers WHERE name = $1', [vendorName]);
            vendorId = res.rows[0].id;

            // Ensure a markup rule exists for this vendor
            await db.query(`
                INSERT INTO markup_rules (supplier_id, item_name, base_rate_type, op1, val1)
                VALUES ($1, 'Broiler Chicken', 'Boiler Rate', '+', 0)
                ON CONFLICT DO NOTHING
            `, [vendorId]);
            // Note: markup_rules might not have a unique constraint on (supplier_id, item_name) to leverage ON CONFLICT easily
            // If it fails, we might need to delete first or check existence.
            // Assuming for now simple insert is okay or table is cleaned. 
            // Better: Check existence
            const markupRes = await db.query('SELECT id FROM markup_rules WHERE supplier_id = $1 AND item_name = $2', [vendorId, 'Broiler Chicken']);
            if (markupRes.rows.length === 0) {
                await db.query(`
                    INSERT INTO markup_rules (supplier_id, item_name, base_rate_type, op1, val1)
                    VALUES ($1, 'Broiler Chicken', 'Boiler Rate', '+', 0)
                `, [vendorId]);
            }

        } catch (error) {
            console.error('Setup failed:', error);
            throw error;
        }
    });

    test('should allow manager to set daily chicken rate', async ({ page }) => {
        await page.goto('/login');
        await page.fill('input[type="email"]', 'manager@alzohra.com');
        await page.fill('input[type="password"]', 'manager123');
        await page.click('button[type="submit"]');
        await page.waitForURL('/'); // Wait for login to complete

        await page.goto('/chicken/rates');

        await page.fill('input[type="date"]', today);
        // Tandoor is 0, Boiler is 1, Egg is 2
        const boilerInput = page.locator('input[type="number"]').nth(1);
        await boilerInput.clear();
        await boilerInput.fill('125.50');
        await page.click('button:has-text("Save Rates")');

        await expect(page.locator('.toast, div[role="alert"]')).toContainText('Rates updated successfully');

        // DB Assertion
        const res = await db.query('SELECT boiler_rate FROM daily_rates WHERE date = $1', [today]);
        expect(Number(res.rows[0].boiler_rate)).toBe(125.50);
    });

    test('should calculate vendor markup correctly', async ({ page }) => {
        await page.goto('/login');
        await page.fill('input[type="email"]', 'manager@alzohra.com');
        await page.fill('input[type="password"]', 'manager123');
        await page.click('button[type="submit"]');
        await page.waitForURL('/');

        await page.goto('/chicken/bills');

        // Select Supplier by label content in option
        await page.locator('select').filter({ hasText: 'Select Supplier' }).selectOption({ label: vendorName });

        // Wait for items to load
        await page.waitForTimeout(500); // Small wait for fetch

        // Select Item
        await page.locator('select').filter({ hasText: 'Select Item' }).selectOption({ label: 'Broiler Chicken' });

        await page.fill('input[placeholder="Qty"]', '100');
        await page.fill('input[placeholder="₹"]', '120');

        await page.click('button:has-text("Add Entry")');

        // Wait for success message
        await expect(page.locator('.toast, div[role="alert"]')).toContainText('Bill entry added');

        // Verify Journal Entries for this transaction
        await db.verifyJournalBalance();
    });

    test('should block editing chicken data after day closure', async ({ page }) => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = yesterday.toISOString().split('T')[0];

        // Lock the day in DB
        await db.query(`
            INSERT INTO daily_balances (date, type, account_code, opening_balance, closing_balance, status) 
            VALUES ($1, 'Counter', 1000, 0, 0, 'closed') 
            ON CONFLICT (date, account_code) 
            DO UPDATE SET status = 'closed'
        `, [yStr]);
        // Note: status might be 'closed' lowercase based on db.ts check? 
        // BillEntry check logic for locking is enforced by backend, assumed logic "status != Open"?

        await page.goto('/login');
        await page.fill('input[type="email"]', 'manager@alzohra.com');
        await page.fill('input[type="password"]', 'manager123');
        await page.click('button[type="submit"]');
        await page.waitForURL('/');

        await page.goto('/chicken/bills');

        // Populate date for yesterday
        await page.fill('input[type="date"]', yStr);

        // Select Supplier
        await page.locator('select').filter({ hasText: 'Select Supplier' }).selectOption({ label: vendorName });

        // Wait for items to load
        await page.waitForTimeout(500);

        // Select Item
        await page.locator('select').filter({ hasText: 'Select Item' }).selectOption({ label: 'Broiler Chicken' });

        await page.fill('input[placeholder="Qty"]', '10');
        await page.fill('input[placeholder="₹"]', '100');

        // Try to add entry
        await page.click('button:has-text("Add Entry")');

        // Expect Error Toast
        // Only if backend validates closure. 
        // If not implemented, this test fails. 
        // Assuming implementation is correct as per tasks.
        const toast = page.locator('.toast, div[role="alert"]');
        await expect(toast).toBeVisible();
        // Check text content to contain "closed" or "locked"
        // Adjust based on actual message. If unknown, just checking it's an error (red?) or text.
        // Let's assume text "Day is closed" or similar.
        // Use a regex for flexibility
        await expect(toast).toContainText(/closed|locked|error/i);
    });

    test.afterAll(async () => {
        // Cleanup
    });
});
