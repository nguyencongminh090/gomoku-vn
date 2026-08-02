import { test, expect, Page } from '@playwright/test';
import { io as ioClient } from 'socket.io-client';

/**
 * TEST-MATRIX.md rows 19, 21 — authorization boundary (a user with no
 * membership in a room cannot kick/change settings in it) and a chat-escaping
 * regression guard (fix-log TODO #2/#13/#15: server escapes `<`/`>`, client
 * decodes only the entity back to text via `textContent`, never re-parses
 * markup).
 *
 * The authorization check lives in RoomManager.kickUser/updateSettings
 * (server/managers/RoomManager.js ~line 323-420): both resolve the room via
 * `_getUserRoom(callerId)` — the CALLER's own room membership, never the
 * target room — so an outsider with no room at all gets rejected before the
 * target room is even touched. This test drives that path for real over a
 * live socket connection (not just the Jest unit around kickUser).
 */

async function makeGuest(browser: any, actor: string) {
  const ctx = await browser.newContext();
  const page: Page = await ctx.newPage();
  const res = await page.request.post('/api/auth/guest');
  expect(res.ok(), `${actor} guest auth should succeed`).toBeTruthy();
  const { token, displayName } = await res.json();
  await ctx.addInitScript(([t, d]) => {
    localStorage.setItem('gvn_token', t as string);
    localStorage.setItem('gvn_display_name', d as string);
  }, [token, displayName]);
  return { ctx, page, actor, displayName };
}

test.describe('Security boundary', () => {
  // Each test creates its own room from this same local IP; serial avoids
  // tripping MAX_ROOMS_PER_IP (=3, server/config.js) under parallel workers.
  test.describe.configure({ mode: 'serial' });

  test('a user with no room membership cannot kick or change settings in someone else\'s room', async ({ browser }) => {
    test.setTimeout(60_000);

    const A = await makeGuest(browser, 'PlayerA');
    await A.page.goto('/index.html');
    await A.page.click('#btn-create');
    await A.page.click('#btn-quick-match');
    await A.page.waitForURL(/room\.html/, { timeout: 15000 });
    const roomId = new URL(A.page.url()).searchParams.get('id');

    const B = await makeGuest(browser, 'PlayerB');
    await B.page.goto(`/room.html?id=${encodeURIComponent(roomId!)}`);
    await expect(B.page.locator('#room-id-nav')).not.toHaveText('', { timeout: 15000 });
    const bUserId = await B.page.evaluate(() => (window as any).RoomState.myUser.userId);

    // Outsider: authenticated, but never joined any room. Deliberately a raw
    // socket.io-client connection (not a second browser page) — creating a
    // second SocketClient() on an already-connected page evicts that page's
    // own primary session (single-session-per-user, SocketHandler.js) and
    // bounces it to login.html via the 'session:kicked' handler, destroying
    // the evaluate() context mid-flight. A real attacker wouldn't necessarily
    // go through this app's browser UI at all, so this is also the more
    // realistic shape for the probe.
    const outsiderAuth = await fetch(new URL('/api/auth/guest', A.page.url()).origin + '/api/auth/guest', { method: 'POST' })
      .then((r) => r.json());
    const outsiderSocket = ioClient(new URL(A.page.url()).origin, { auth: { token: outsiderAuth.token } });
    await new Promise<void>((resolve, reject) => {
      outsiderSocket.on('connect', () => resolve());
      outsiderSocket.on('connect_error', reject);
    });

    function emitAndWait(event: string, payload: any) {
      return new Promise((resolve) => {
        const onError = (d: any) => { cleanup(); resolve({ error: d.message }); };
        const onUpdated = () => { cleanup(); resolve({ unexpected: 'room:updated received' }); };
        function cleanup() {
          outsiderSocket.off('room:error', onError);
          outsiderSocket.off('room:updated', onUpdated);
        }
        outsiderSocket.on('room:error', onError);
        outsiderSocket.on('room:updated', onUpdated);
        outsiderSocket.emit(event, payload);
        setTimeout(() => { cleanup(); resolve({ timedOut: true }); }, 5000);
      });
    }

    const kickResult = await emitAndWait('room:kick', { userId: bUserId });
    expect((kickResult as any).error, 'kick from a non-member must be rejected with an error, not silently applied').toBeTruthy();

    const settingsResult = await emitAndWait('room:settings', { settings: { boardSize: 15 } });
    expect((settingsResult as any).error, 'settings change from a non-member must be rejected').toBeTruthy();

    // Confirm B is still actually in the room, untouched by the attack.
    await expect(B.page.locator('#room-id-nav')).not.toHaveText('', { timeout: 5000 });

    outsiderSocket.disconnect();
    await A.ctx.close();
    await B.ctx.close();
  });

  test('a chat message containing markup is escaped and never renders as a live tag', async ({ browser }) => {
    test.setTimeout(60_000);

    const A = await makeGuest(browser, 'PlayerA');
    await A.page.goto('/index.html');
    await A.page.click('#btn-create');
    await A.page.click('#btn-quick-match');
    await A.page.waitForURL(/room\.html/, { timeout: 15000 });
    const roomId = new URL(A.page.url()).searchParams.get('id');

    const B = await makeGuest(browser, 'PlayerB');
    await B.page.goto(`/room.html?id=${encodeURIComponent(roomId!)}`);
    await expect(B.page.locator('#room-id-nav')).not.toHaveText('', { timeout: 15000 });

    const payload = '<img src=x onerror="window.__xss_fired = true">';
    await A.page.fill('#chat-input', payload);
    await A.page.click('#btn-send');

    await expect(B.page.locator('#chat-messages')).toContainText('<img', { timeout: 10000 });

    // The literal text must be visible (round-tripped through the escape
    // pipeline), and critically the script must never have executed — no
    // live <img> element in the DOM, and the onerror handler never fired.
    const liveImgCount = await B.page.locator('#chat-messages img').count();
    expect(liveImgCount, 'chat markup must render as text, never as a live element').toBe(0);
    const xssFired = await B.page.evaluate(() => (window as any).__xss_fired === true);
    expect(xssFired, 'onerror handler must never execute').toBe(false);

    await A.ctx.close();
    await B.ctx.close();
  });
});
