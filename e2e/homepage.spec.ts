import { test, expect } from '@playwright/test';

/**
 * Smoke test: an anonymous visitor hitting the site root.
 *
 * `/` serves client/index.html (the lobby), whose lobby.js bootstrap does
 * `window.location.replace('login.html')` when there is no stored session,
 * so the landing page for a logged-out user is the login screen.
 */
test.describe('homepage', () => {
  test('root loads and lands on the login screen', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    await expect(page).toHaveURL(/login\.html$/);
    await expect(page).toHaveTitle('Play3CR — Đăng nhập');
  });

  test('login page renders its form without console errors', async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/login.html');

    await expect(page.locator('#form-login')).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });
});
