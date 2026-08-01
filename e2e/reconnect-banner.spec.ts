import { test, expect } from '@playwright/test';

/**
 * TODO #14: socket-client.js bound 'reconnect_attempt'/'reconnect' on the
 * Socket instead of the Manager (`socket.io`), so Socket.io v4 never fired
 * them and the status banner got stuck on "Mất kết nối..." instead of
 * advancing to "Kết nối lại... (lần N)". This drives a real disconnect via
 * a dropped network rather than asserting on the source, since the bug is in
 * which object the listener is attached to, not in the handler body.
 */
test.describe('reconnect status banner', () => {
  test('advances through reconnecting text and clears on reconnect', async ({ page, context }) => {
    test.setTimeout(90000);
    const res = await page.request.post('/api/auth/guest');
    const { token, displayName } = await res.json();
    await context.addInitScript(([t, d]) => {
      localStorage.setItem('gvn_token', t as string);
      localStorage.setItem('gvn_display_name', d as string);
    }, [token, displayName]);

    await page.goto('/index.html');
    const banner = page.locator('#status-banner');
    await expect(banner).not.toHaveClass(/visible/);

    await context.setOffline(true);
    await expect(banner).toHaveClass(/visible/, { timeout: 60000 });
    await expect(banner).toHaveText(/Mất kết nối/);

    // Only reachable if the Manager-level listener fires.
    await expect(banner).toHaveText(/Kết nối lại\.\.\. \(lần \d+\)/, { timeout: 15000 });

    await context.setOffline(false);
    await expect(banner).not.toHaveClass(/visible/, { timeout: 15000 });
  });
});
