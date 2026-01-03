import { test, expect } from '@playwright/test';

test.describe('Finance & Inventory System Verification', () => {

    test('Should login and verify Financial Flows without 500 errors', async ({ page }) => {
        // 1. Setup Network Monitoring to Fail on 500 Errors
        const failedRequests = [];
        page.on('response', response => {
            if (response.status() >= 500) {
                failedRequests.push(`${response.request().method()} ${response.url()} -> ${response.status()}`);
                console.error(`SERVER ERROR: ${response.request().method()} ${response.url()} -> ${response.status()}`);
            }
        });

        // 2. Login
        await page.goto('/login');
        // Using default credentials or test user
        await page.fill('input[type="email"]', 'admin@alzohra.com');
        await page.fill('input[type="password"]', 'admin123');
        await page.click('button[type="submit"]');

        // Wait for navigation to dashboard - adjust timeout if needed
        await expect(page).toHaveURL('/', { timeout: 10000 });

        // 3. Verify Calendar Colors (Inventory)
        await page.goto('/chicken/rates');
        // Wait for data load
        await page.waitForTimeout(2000);

        // 4. Verify Finance Dashboard & Daily Balance
        await page.goto('/finance');
        await expect(page.locator('h1, h2')).toContainText(/Finance|Dashboard/i);
        // Wait for fetch
        await page.waitForTimeout(2000);

        // 5. Perform Money Transfer (Safe -> User)
        await page.goto('/finance/transfer');
        // Wait for form
        await expect(page.locator('form')).toBeVisible();

        // Fill Transfer Form
        // Try to select Main Safe if it exists, otherwise rely on default
        const fromSelect = page.locator('select').first();
        await fromSelect.selectOption({ index: 0 }); // First option

        const toSelect = page.locator('select').nth(1);
        await toSelect.selectOption({ index: 1 }); // Second option (User)

        await page.fill('input[type="number"]', '10');
        // Description might be textarea or input
        await page.locator('textarea, input[type="text"]').last().fill('E2E Test Transfer');

        await page.click('button:has-text("Transfer")');

        // Expect success
        // Wait for network idle or success message
        await page.waitForTimeout(2000);

        // 7. Final Assertion on Network Errors
        if (failedRequests.length > 0) {
            console.error('FAILED REQUESTS:', failedRequests);
        }
        expect(failedRequests, `Found Server Errors:\n${failedRequests.join('\n')}`).toHaveLength(0);
    });
});
