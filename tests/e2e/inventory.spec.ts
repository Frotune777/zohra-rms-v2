
import { test, expect } from '@playwright/test';
import { db } from '../utils/db';

test.describe('Inventory Module (Non-POS)', () => {
    test.beforeAll(async () => {
        // Prepare DB
    });

    test('should allow manager to manually add stock', async ({ page }) => {
        // Setup item
        const itemName = 'Rice Sack 50kg';
        // Ensure item exists
        await db.query(`INSERT INTO inventory_items (name, stock_qty) VALUES ($1, 10) ON CONFLICT (name) DO UPDATE SET stock_qty = 10`, [itemName]);

        await page.goto('/login');
        await page.fill('input[type="email"]', 'manager@alzohra.com');
        await page.fill('input[type="password"]', 'manager123');
        await page.click('button[type="submit"]');

        await page.goto('/inventory/adjust');

        await page.selectOption('select[name="item_id"]', { label: itemName });
        await page.selectOption('select[name="type"]', 'ADD');
        await page.fill('input[name="quantity"]', '5');
        await page.fill('input[name="reason"]', 'Restock Manually');
        await page.click('button:has-text("Submit Adjustment")');

        await expect(page.locator('.toast')).toContainText('Stock updated');

        // Verify DB
        const res = await db.query('SELECT stock_qty FROM inventory_items WHERE name = $1', [itemName]);
        expect(Number(res.rows[0].stock_qty)).toBe(15);

        // Verify Journal (Inventory Debit, Equity/Adjustment Credit)
        await db.verifyJournalBalance();
    });

    test('should record wastage and reduce stock', async ({ page }) => {
        const itemName = 'Tomatoes';
        await db.query(`INSERT INTO inventory_items (name, stock_qty) VALUES ($1, 20) ON CONFLICT (name) DO UPDATE SET stock_qty = 20`, [itemName]);

        await page.goto('/login');
        await page.fill('input[type="email"]', 'manager@alzohra.com');
        await page.fill('input[type="password"]', 'manager123');
        await page.click('button[type="submit"]');

        await page.goto('/inventory/wastage');

        await page.selectOption('select[name="item_id"]', { label: itemName });
        await page.fill('input[name="quantity"]', '2');
        await page.fill('input[name="reason"]', 'Spoiled');
        await page.click('button:has-text("Record Wastage")');

        await expect(page.locator('.toast')).toContainText('Wastage recorded');

        // Verify DB: 20 - 2 = 18
        const res = await db.query('SELECT stock_qty FROM inventory_items WHERE name = $1', [itemName]);
        expect(Number(res.rows[0].stock_qty)).toBe(18);

        // Journal: Debit Wastage Expense, Credit Inventory
        await db.verifyJournalBalance();
    });

    test('should prevent negative stock if configured', async ({ page }) => {
        const itemName = 'Limited Item';
        await db.query(`INSERT INTO inventory_items (name, stock_qty) VALUES ($1, 5) ON CONFLICT (name) DO UPDATE SET stock_qty = 5`, [itemName]);

        await page.goto('/login');
        await page.fill('input[type="email"]', 'manager@alzohra.com');
        await page.fill('input[type="password"]', 'manager123');
        await page.click('button[type="submit"]');

        await page.goto('/inventory/wastage'); // or usage

        await page.selectOption('select[name="item_id"]', { label: itemName });
        await page.fill('input[name="quantity"]', '10'); // More than 5
        await page.click('button:has-text("Record Wastage")');

        // Expect Error
        await expect(page.locator('.toast')).toContainText('Insufficient stock'); // or similar error

        // Assert no change in DB
        const res = await db.query('SELECT stock_qty FROM inventory_items WHERE name = $1', [itemName]);
        expect(Number(res.rows[0].stock_qty)).toBe(5);
    });
});
