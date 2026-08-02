import { test, expect, Page } from '@playwright/test';

/**
 * TEST-MATRIX.md row 20 — single-session-per-user enforcement. When a second
 * connection authenticates as the same userId, the server evicts the first:
 * SocketHandler.js ~line 88-99 looks up `sessions.get(userId)` (keyed purely
 * off the decoded JWT userId), emits `session:kicked` to the stale socket,
 * then force-disconnects it. The client's handler
 * (client/js/socket-client.js `session:kicked`) sets a
 * `sessionStorage.gvn_kicked_notice` flag and does
 * `window.location.replace('login.html')`, which then shows an alert banner.
 *
 * Two independent `/api/auth/guest` calls can never collide (each mints a
 * fresh random userId — server/routes/auth.js), so eviction is only
 * reachable through the registered-account login flow: register once, then
 * log in again with the same credentials to get a second JWT carrying the
 * SAME userId, and connect a second browser context with it.
 */

test.describe('Session eviction', () => {
  test('logging in as the same user from a second connection evicts the first', async ({ browser }) => {
    test.setTimeout(60_000);

    const ctxA = await browser.newContext();
    const pageA: Page = await ctxA.newPage();

    const username = `qauser_${Date.now().toString(36)}`;
    const password = 'testpass123';
    const displayName = 'SessionTestUser';

    const registerRes = await pageA.request.post('/api/auth/register', {
      data: { username, password, displayName },
    });
    expect(registerRes.ok(), 'register should succeed').toBeTruthy();
    const { token: tokenA } = await registerRes.json();

    await ctxA.addInitScript(([t, d]) => {
      localStorage.setItem('gvn_token', t as string);
      localStorage.setItem('gvn_display_name', d as string);
    }, [tokenA, displayName]);
    await pageA.goto('/index.html');
    await expect(pageA.locator('#btn-create')).toBeVisible({ timeout: 15000 });
    // Give the lobby socket a moment to actually establish. Unlike room.html
    // (which exposes window.RoomState/#room-id-nav to poll), index.html's
    // lobby socket client is a module-local variable with no global hook, so
    // there's no state to wait on directly here.
    await pageA.waitForTimeout(1500);

    // Second login with the same credentials — a fresh JWT, same userId.
    const loginRes = await pageA.request.post('/api/auth/login', {
      data: { username, password },
    });
    expect(loginRes.ok(), 'login with the same credentials should succeed').toBeTruthy();
    const { token: tokenB } = await loginRes.json();

    const ctxB = await browser.newContext();
    const pageB: Page = await ctxB.newPage();
    await ctxB.addInitScript(([t, d]) => {
      localStorage.setItem('gvn_token', t as string);
      localStorage.setItem('gvn_display_name', d as string);
    }, [tokenB, displayName]);
    await pageB.goto('/index.html');
    await expect(pageB.locator('#btn-create')).toBeVisible({ timeout: 15000 });

    // A's session (the older connection, same userId) gets evicted and
    // bounced to login.html with the session-kicked alert.
    await pageA.waitForURL(/login\.html/, { timeout: 15000 });
    await expect(pageA.locator('#alert-banner')).toContainText('thiết bị khác', { timeout: 10000 });

    // B is unaffected — still on the lobby, no bounce to login.html.
    await pageB.waitForTimeout(1000);
    expect(pageB.url()).toContain('index.html');
    await expect(pageB.locator('#btn-create')).toBeVisible();

    await ctxA.close();
    await ctxB.close();
  });
});
