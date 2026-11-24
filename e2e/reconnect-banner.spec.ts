import { test, expect } from './helpers/fixtures';
import { authAsGuest } from './helpers/auth';

/**
 * TODO #14 + #367: socket-client.js bound 'reconnect_attempt'/'reconnect' on the
 * Socket instead of the Manager (`socket.io`), so Socket.io v4 never fired
 * them and the status banner got stuck on "Mất kết nối..." instead of
 * advancing to "Kết nối lại... (lần N)". Since #367 (BANNER_DELAY_MS = 8000),
 * the banner stays hidden for 8 s on short blips — by the time it appears on a
 * sustained drop, Socket.io's Manager has already fired `reconnect_attempt`, so
 * the banner opens directly on "Kết nối lại... (lần N)" and increments while
 * still offline (if the Manager listener were broken, it would be stuck on
 * "Mất kết nối...").
 */
test.describe('reconnect status banner', () => {
  test('advances through reconnecting text and clears on reconnect', async ({ page, context }) => {
    test.setTimeout(90000);
    await authAsGuest(context, page);

    await page.goto('/index.html');
    const banner = page.locator('#status-banner');
    await expect(banner).not.toHaveClass(/visible/);

    await context.setOffline(true);
    await expect(banner).toHaveClass(/visible/, { timeout: 60000 });

    // Only reachable if the Manager-level `reconnect_attempt` listener fires.
    await expect(banner).toHaveText(/Kết nối lại\.\.\. \(lần \d+\)/, { timeout: 15000 });
    const firstText = (await banner.textContent()) || '';
    const firstAttempt = Number(firstText.match(/lần (\d+)/)?.[1] || 0);
    expect(firstAttempt).toBeGreaterThanOrEqual(1);
    await expect(banner).not.toHaveText(firstText, { timeout: 15000 });
    await expect(banner).toHaveText(/Kết nối lại\.\.\. \(lần \d+\)/);

    await context.setOffline(false);
    await expect(banner).not.toHaveClass(/visible/, { timeout: 15000 });
  });
});
