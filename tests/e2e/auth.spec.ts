
import { test, expect } from '@playwright/test';
import { db } from '../utils/db';

test.describe('Authentication & RBAC', () => {
    test.beforeAll(async () => {
        // Ideally ensure DB is clean or has known state
        // For now, we assume seed data or we might need to seed users here
        // But since this is PROD grade, we should probably rely on existing users or create temp ones
    });

    test('should login successfully as manager', async ({ page }) => {
        await page.goto('/login');
        await page.fill('input[type="email"]', 'manager@alzohra.com');
        await page.fill('input[type="password"]', 'manager123');
        await page.click('button[type="submit"]');

        await expect(page).toHaveURL('/');
        // Verify specific manager element is visible
        await expect(page.getByRole('link', { name: 'Dashboard', exact: true })).toBeVisible();
    });

    test('should fail login with invalid credentials', async ({ page }) => {
        await page.goto('/login');
        await page.fill('input[type="email"]', 'manager@alzohra.com'); // invalid user test but use email type
        await page.fill('input[type="password"]', 'wrongpass');
        await page.click('button[type="submit"]');

        await expect(page.locator('text=/Invalid|failed|incorrect/i')).toBeVisible();
    });

    test('staff user should not see finance links', async ({ page }) => {
        // Login as staff
        await page.goto('/login');
        await page.fill('input[type="email"]', 'staff@alzohra.com');
        await page.fill('input[type="password"]', 'staff123');
        await page.click('button[type="submit"]');

        await expect(page).toHaveURL('/');

        // Assert absence of Finance links
        await expect(page.locator('a[href="/finance"]')).not.toBeVisible();
        await expect(page.locator('a[href="/payroll"]')).not.toBeVisible();
    });

    test('staff user accessing finance route directly should be redirected or see 403', async ({ page }) => {
        // Login as staff
        await page.goto('/login');
        await page.fill('input[type="email"]', 'staff@alzohra.com');
        await page.fill('input[type="password"]', 'staff123');
        await page.click('button[type="submit"]');

        await page.goto('/finance');
        // Expect redirect to home or 403 page
        // Adjust based on actual app behavior (e.g., redirect to / or /unauthorized)
        await expect(page).not.toHaveURL('/finance');
    });
});
