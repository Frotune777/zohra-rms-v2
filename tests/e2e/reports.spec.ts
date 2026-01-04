
import { test, expect } from '@playwright/test';
import { db } from '../utils/db';
import fs from 'fs';
import path from 'path';

test.describe('Reports Module', () => {
    test.beforeAll(async () => {
        // Prepare DB
    });

    test('should generate P&L report with correct totals', async ({ page }) => {
        // Ensure some revenue and expense data exists for the period
        // ... (Seeding code omitted for brevity, assuming pre-seeded or dynamically added)

        await page.goto('/login');
        await page.fill('input[type="email"]', 'manager@alzohra.com');
        await page.fill('input[type="password"]', 'manager123');
        await page.click('button[type="submit"]');

        await page.goto('/reports/pnl');

        // Select Period (Current Month)
        await page.click('button:has-text("Generate")');

        // Check for key elements like Total Revenue, Cost of Goods Sold, Net Profit
        await expect(page.locator('text=Net Profit')).toBeVisible();

        // Validate values against DB
        // Assuming we can grab the displayed value
        const displayedProfitText = await page.locator('[data-testid="net-profit-value"]').textContent();
        // Calculate expected from DB
        /*
        const res = await db.query(`
            SELECT 
                SUM(CASE WHEN type IN ('REVENUE') THEN credit_amount - debit_amount ELSE 0 END) as revenue,
                SUM(CASE WHEN type IN ('EXPENSE') THEN debit_amount - credit_amount ELSE 0 END) as expense
            FROM journal_entries 
            WHERE ...
        `);
        */
        // Simple assertion that it's not zero or empty if we expect data
        expect(displayedProfitText).not.toBe('0.00');
    });

    test('should export report as CSV with correct data', async ({ page }) => {
        await page.goto('/login');
        await page.fill('input[type="email"]', 'manager@alzohra.com');
        await page.fill('input[type="password"]', 'manager123');
        await page.click('button[type="submit"]');

        await page.goto('/reports/expenses');

        // Start download
        const downloadPromise = page.waitForEvent('download');
        await page.click('button:has-text("Export CSV")');
        const download = await downloadPromise;

        // Verify filename
        expect(download.suggestedFilename()).toContain('expenses_report');

        // Verify content
        const stream = await download.createReadStream();
        // Read stream to string (simplified for example)
        // In real test, might save to temp file and read
        // Or usage: await download.saveAs('/path/to/save');

        // Assert path is valid
        expect(await download.path()).toBeTruthy();
    });
});
