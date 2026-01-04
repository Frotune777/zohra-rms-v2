
import { test, expect } from '@playwright/test';
import { db } from '../utils/db';

test.describe('Day Closure Module', () => {
    test.beforeAll(async () => {
        // Prepare DB
    });

    test('should successfully close the day', async ({ page }) => {
        const today = new Date().toISOString().split('T')[0];

        // Ensure today is not already closed
        await db.query(`DELETE FROM daily_balances WHERE date = $1`, [today]);

        await page.goto('/login');
        await page.fill('input[type="email"]', 'owner@alzohra.com'); // Usually restricted to owner/manager
        await page.fill('input[type="password"]', 'owner123');

        // Second replacement
        await page.fill('input[type="email"]', 'manager@alzohra.com');
        await page.fill('input[type="password"]', 'manager123');

        // ... (separate block for next replacement in same call due to AllowMultiple=true but different context?) 
        // No, AllowMultiple works on identical TargetContent.
        // But the first one has 'owner' and second has 'manager'. So I need separate calls or separate chunks.
        // Actually I can't use AllowMultiple for different content.
        // I'll do separate chunks in one call if possible, or multiple replace_file_content calls.
        // The tool definition says "To edit multiple, non-adjacent lines... make a single call to multi_replace_file_content".
        // But I am using replace_file_content which supports chunks? No, replace_file_content supports SINGLE chunk.
        // I should use multi_replace_file_content for closure.spec.ts if I want to do both.
        // Or just call replace_file_content twice. I'll use separate calls for safety.
        await page.click('button[type="submit"]');

        await page.goto('/closure');

        // Validate pre-conditions (e.g., all shifts closed)
        // Assuming override or correct state

        await page.click('button:has-text("Close Day")');
        await page.click('button:has-text("Confirm Closure")'); // Confirmation modal

        await expect(page.locator('.toast')).toContainText('Day closed successfully');

        // Verify DB Locked
        const isLocked = await db.isPeriodLocked(today);
        expect(isLocked).toBe(true);
    });

    test('should block financial edits after closure', async ({ page }) => {
        // Setup: Ensure TODAY is closed
        const today = new Date().toISOString().split('T')[0];

        await db.query(`
            INSERT INTO daily_balances (date, type, account_code, opening_balance, closing_balance, status) 
            VALUES ($1, 'Counter', 1000, 0, 0, 'Closed') 
            ON CONFLICT (date, account_code) 
            DO UPDATE SET status = 'Closed'
        `, [today]);

        await page.goto('/login');
        await page.fill('input[type="email"]', 'manager@alzohra.com');
        await page.fill('input[type="password"]', 'manager123');
        await page.click('button[type="submit"]');

        // Try to add expense for TODAY
        await page.goto('/finance');
        await expect(page.locator('text=Financial Dashboard')).toBeVisible({ timeout: 15000 });

        await page.click('button:has-text("Add Entry")');

        // Form defaults to Today
        await page.selectOption('select', 'expense');
        await page.fill('input[placeholder="e.g., Office rent"]', 'Blocked Expense');
        await page.fill('input[placeholder="5000"]', '100');

        await page.click('button:has-text("Save")');

        // Expect Error
        // The toast usually contains "Day is closed" or "locked"
        await expect(page.locator('.toast')).toContainText(/closed|locked/i);
    });
});
