import { test, expect } from '@playwright/test';

/**
 * Regression test for TODO.md #40 / instruction.md §40: pasting/typing a bare
 * `room.html` link — no `?id=` query param, and no `sessionStorage`
 * `gvn_room_intent` set by the normal create/join-from-lobby flow — used to
 * freeze forever on `#room-entry-overlay` ("Đang vào phòng..."). Root cause:
 * `processRoomIntent()` (client/js/room-socket.js) only emitted
 * `room:create`/`room:join` when one of those two sources was present; with
 * neither, nothing ever fired and `room:joined` (the only thing that hides
 * the overlay) never arrived.
 *
 * Fix: an `else` fallback in that same function redirects to `index.html`
 * instead of leaving the overlay up with no event that will ever resolve it.
 */
test.describe('room.html with no ?id= and no room intent', () => {
  test('redirects back to the lobby instead of freezing on the entry overlay', async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();

    const res = await page.request.post('/api/auth/guest');
    expect(res.ok()).toBeTruthy();
    const { token, displayName } = await res.json();
    await ctx.addInitScript(([t, d]) => {
      localStorage.setItem('gvn_token', t as string);
      localStorage.setItem('gvn_display_name', d as string);
    }, [token, displayName]);

    // Bare room.html, no query string, no sessionStorage intent (fresh page).
    await page.goto('/room.html');

    await page.waitForURL(/index\.html$/, { timeout: 5000 });
    await expect(page).toHaveURL(/index\.html$/);
  });

  test('still enters the room normally when ?id= is present (fix does not break the existing join path)', async ({ browser }) => {
    // Regression guard: the fallback must only fire when BOTH the intent and
    // ?id= are absent — a direct link with ?id= (e.g. shared by a friend)
    // must keep working exactly as before.
    const hostCtx = await browser.newContext();
    const hostPage = await hostCtx.newPage();
    const hostRes = await hostPage.request.post('/api/auth/guest');
    const hostAuth = await hostRes.json();
    await hostCtx.addInitScript(([t, d]) => {
      localStorage.setItem('gvn_token', t as string);
      localStorage.setItem('gvn_display_name', d as string);
    }, [hostAuth.token, hostAuth.displayName]);

    await hostPage.goto('/index.html');
    await hostPage.click('#btn-create');
    await hostPage.click('#modal-advanced-toggle');
    await hostPage.locator('#rule-wall').evaluate((el: HTMLInputElement) => {
      if (el.checked) {
        el.checked = false;
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await hostPage.click('#btn-quick-match');
    await hostPage.waitForURL(/room\.html/, { timeout: 15000 });
    await expect(hostPage.locator('#room-id-nav')).not.toHaveText('', { timeout: 15000 });
    const roomId = new URL(hostPage.url()).searchParams.get('id')!;
    expect(roomId).toBeTruthy();

    const guestCtx = await browser.newContext();
    const guestPage = await guestCtx.newPage();
    const guestRes = await guestPage.request.post('/api/auth/guest');
    const guestAuth = await guestRes.json();
    await guestCtx.addInitScript(([t, d]) => {
      localStorage.setItem('gvn_token', t as string);
      localStorage.setItem('gvn_display_name', d as string);
    }, [guestAuth.token, guestAuth.displayName]);

    await guestPage.goto(`/room.html?id=${encodeURIComponent(roomId)}`);
    await expect(guestPage.locator('#room-id-nav')).not.toHaveText('', { timeout: 15000 });
    // Never bounced to the lobby.
    await expect(guestPage).toHaveURL(/room\.html/);

    await hostCtx.close();
    await guestCtx.close();
  });
});
