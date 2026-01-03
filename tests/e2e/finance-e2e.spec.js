const { test, expect } = require('@playwright/test');

test.describe('Finance Module E2E', () => {

    test.beforeEach(async ({ page }) => {
        // Login
        await page.goto('/login');
        await page.fill('input[type="email"]', 'admin@alzohra.com');
        await page.fill('input[type="password"]', 'password123');
        await page.click('button[type="submit"]');
        await expect(page).toHaveURL('/');
    });

    test('Money Transfer UI loads and elements are present', async ({ page }) => {
        // Navigate to Finance - Force click to handle potential overlay/viewport issues
        await page.click('text=Finance', { force: true });
        await expect(page).toHaveURL(/\/finance/);

        // Navigate to Money Transfer
        await page.click('text=Money Transfer', { force: true });

        // Verify Components
        await expect(page.locator('text=Internal Money Transfer')).toBeVisible();
        await expect(page.locator('text=Safe → Recipient')).toBeVisible();
        // Use first() if multiple elements match or be more specific
        await expect(page.locator('text=Current Wallet Balance').first()).toBeVisible();
    });

    test('Perform Transfer (Safe to User)', async ({ page }) => {
        await page.goto('/finance/transfer');

        // Select Recipient Type (User is default)
        // Select Recipient (Test Admin)
        await page.selectOption('select', { label: 'Test Admin (owner)' });

        // Check if Balance appears
        await expect(page.locator('text=Current Wallet Balance').first()).toBeVisible();

        // Enter Amount
        await page.fill('input[type="number"]', '100');
        await page.fill('textarea', 'E2E Test Transfer');

        // Submit
        await page.click('button[type="submit"]');

        // Expect Success Toast (checking for text presence in body generally)
        await expect(page.locator('body')).toContainText('Funds Transferred');
    });
});
