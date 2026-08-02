import { test, expect, Page } from '@playwright/test';

/**
 * Repro + regression test for a reported bug: "Start -> play -> Leave ->
 * Create table -> play" — after leaving a room and immediately creating a
 * new one, the app used to flash over to room.html (showing the empty,
 * uninitialized room chrome underneath) and then bounce back to the lobby
 * instead of entering the new room (TODO.md #18 / instruction.md §B18), and
 * the lobby's room list didn't (visibly) refresh.
 *
 * Root cause (confirmed by reading server/managers/RoomManager.js):
 * leaveRoom() only destroys a room once it's EMPTY (room.users.size === 0).
 * If the player who leaves was the host and the other player/spectator
 * stays connected, the room lives on. server/socket/handlers/LobbyHandler.js
 * room:create enforces MAX_ROOMS_PER_IP (= 3, server/config.js) by counting
 * still-live rooms whose creatorIp matches the creator's IP. Repeating
 * create → join → leave (host leaves, guest stays behind) from the same IP
 * — which is exactly what happens testing with multiple browser tabs/guests
 * on one machine — silently accumulates live rooms without the host
 * realizing it, until the 4th create hits the quota.
 *
 * The quota itself was always correct (this never leaked rooms or
 * miscounted). What was fixed: `submitCreate()` (client/js/lobby.js) still
 * navigates to room.html optimistically (an ack-before-navigate rewrite was
 * tried and reverted — it required disconnecting the lobby's own socket
 * before the new page's socket reconnects, and under real-world-plausible
 * slow-navigation conditions that gap could destroy the very room the user
 * just created; see instruction.md §B18 for the full writeup). Instead,
 * room.html now shows a `#room-entry-overlay` loading state (room.html) by
 * default, hiding the empty/uninitialized chrome until room:joined actually
 * arrives — so a rejected create shows a clear error toast over a
 * deliberate loading state instead of a flash of broken-looking UI, then
 * redirects back after the same ~1.5s pattern already used for
 * room:kicked/room:destroyed elsewhere in room-socket.js.
 *
 * This test creates 3 rooms as the same host (each with a different guest
 * who stays behind and never leaves, keeping the room alive) and asserts
 * that a 4th create attempt fails with the per-IP quota error: the entry
 * overlay stays visible (no glimpse of broken room UI), an error toast
 * appears, and the host bounces back to the lobby — then checks whether the
 * lobby's room list actually repopulates, since that's the second half of
 * the original report.
 */

test.describe('leave then create room — per-IP room quota', () => {
  test('repeatedly leaving a room the guest stays in exhausts the per-IP create quota', async ({ browser }) => {
    test.setTimeout(120_000);

    async function makeGuest(actor: string) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      const res = await page.request.post('/api/auth/guest');
      expect(res.ok(), `${actor} guest auth should succeed`).toBeTruthy();
      const { token, displayName } = await res.json();
      await ctx.addInitScript(([t, d]) => {
        localStorage.setItem('gvn_token', t as string);
        localStorage.setItem('gvn_display_name', d as string);
      }, [token, displayName]);
      return { ctx, page, actor, displayName };
    }

    async function createRoomAsHost(host: { page: Page }) {
      await host.page.goto('/index.html');
      await expect(host.page.locator('#btn-create')).toBeVisible();
      await host.page.click('#btn-create');
      await host.page.click('#modal-advanced-toggle');
      await host.page.locator('#rule-wall').evaluate((el: HTMLInputElement) => {
        if (el.checked) {
          el.checked = false;
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
      await host.page.click('#btn-quick-match');
      await host.page.waitForURL(/room\.html/, { timeout: 15000 });
      await expect(host.page.locator('#room-id-nav')).not.toHaveText('', { timeout: 15000 });
      const roomId = new URL(host.page.url()).searchParams.get('id');
      expect(roomId).toBeTruthy();
      return roomId!;
    }

    // The host — reused across all cycles, same browser/IP throughout.
    const host = await makeGuest('Host');

    const leftoverGuests: { ctx: any; page: Page; actor: string }[] = [];

    // Cycle 1-3: host creates a room, a fresh guest joins and STAYS (does not
    // leave, does not close their tab), host leaves. Because the guest is
    // still connected, the room is never destroyed — it just sits there.
    for (let i = 1; i <= 3; i++) {
      const roomId = await createRoomAsHost(host);

      const guest = await makeGuest(`Guest${i}`);
      await guest.page.goto(`/room.html?id=${encodeURIComponent(roomId)}`);
      await expect(guest.page.locator('#room-id-nav')).not.toHaveText('', { timeout: 15000 });
      leftoverGuests.push(guest);

      // Host leaves. Not seated, so no confirm() dialog and no force-resign.
      await host.page.click('#btn-leave');
      await host.page.waitForURL(/index\.html/, { timeout: 10000 });

      console.log(`[cycle ${i}] host created ${roomId}, ${guest.actor} stayed behind, host left`);
    }

    // 4th create from the same host/IP: the 3 rooms above are all still
    // alive (each still has its guest connected), so this should hit
    // MAX_ROOMS_PER_IP and bounce the host back to the lobby.
    await host.page.goto('/index.html');
    await expect(host.page.locator('#btn-create')).toBeVisible();
    await host.page.waitForTimeout(1500); // let lobby:subscribe's snapshot land
    const preCreateCards = await host.page.locator('.room-card').allTextContents();
    console.log(`[before cycle 4 create] lobby shows ${preCreateCards.length} room card(s): ${JSON.stringify(preCreateCards)}`);
    await host.page.click('#btn-create');
    await host.page.click('#btn-quick-match');

    // Still navigates to room.html optimistically (the ack-before-navigate
    // rewrite was reverted — see the file header comment for why). What's
    // fixed: #room-entry-overlay (room.html) is visible by default, so the
    // empty/uninitialized room chrome underneath is never shown — this is
    // the actual fix for the "flash" complaint.
    await host.page.waitForURL(/room\.html/, { timeout: 8000 });
    await expect(host.page.locator('#room-entry-overlay'), 'the entry overlay should cover the room UI immediately on arrival, before room:joined/room:error has had a chance to resolve').toHaveClass(/visible/);

    // A clear error toast should appear (over the overlay, z-index 1200 vs
    // 1100 — see main.css .toast-stack) rather than the rejection being
    // silent or only visible as a bare URL bounce.
    const errorToast = host.page.locator('.toast--error');
    await expect(errorToast).toBeVisible({ timeout: 5000 });
    const toastText = await errorToast.textContent();
    console.log(`[cycle 4] rejection toast: ${toastText}`);
    expect(toastText).toContain('quá nhiều phòng');

    // Then bounces back to the lobby, same ~1.5s pattern as room:kicked /
    // room:destroyed elsewhere in room-socket.js.
    const bounced = await host.page
      .waitForURL(/index\.html/, { timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    expect(bounced, '4th room:create from the same IP should be rejected by MAX_ROOMS_PER_IP and bounce back to the lobby').toBe(true);

    // Now check the actual complaint: does the lobby's room list repopulate
    // after being bounced back? The 3 leftover rooms (still alive, guests
    // still connected) should be visible.
    await host.page.waitForTimeout(2000); // let lobby:subscribe's snapshot land
    const roomListHtml = await host.page.locator('#room-list').innerHTML();
    const roomCardCount = await host.page.locator('.room-card').count();
    console.log(`[lobby after bounce] room cards visible: ${roomCardCount}`);
    console.log(`[lobby after bounce] #room-list innerHTML snippet: ${roomListHtml.slice(0, 500)}`);

    expect(roomCardCount, 'lobby room list should show the 3 still-live rooms after bouncing back from the failed create').toBeGreaterThanOrEqual(3);

    await host.ctx.close();
    for (const g of leftoverGuests) await g.ctx.close();
  });
});
