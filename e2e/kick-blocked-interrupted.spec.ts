import { test, expect, Page } from '@playwright/test';

/**
 * TEST-MATRIX.md row 18 — kicking a user is blocked while the room is
 * 'interrupted' (mid disconnect-grace-period). Regression guard tied to
 * TODO.md item 12 / instruction.md §B12.
 *
 * RoomManager.kickUser (server/managers/RoomManager.js ~line 409-411) rejects
 * with 'Không thể mời người ra khi đang chơi.' when `room.state === 'playing'
 * || room.state === 'interrupted'`. The 'interrupted' state itself is set by
 * DisconnectHandler.startDisconnectGrace when a seated player in an ongoing
 * game disconnects (server/socket/handlers/DisconnectHandler.js).
 *
 * The client's own kick button (`.btn-kick`, client/js/room-ui.js
 * renderUsersList) is only ever rendered for unseated spectators and only
 * when `state !== 'playing'` — a disconnected-but-still-seated player is
 * never reachable through it. This test drives `room:kick` directly through
 * the host's own already-connected `window.RoomClient` (not a second
 * SocketClient — see e2e conventions) to exercise the server-side guard.
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

test.describe('Kick blocked during interrupted state', () => {
  test('host cannot kick a seated player while the room is interrupted by their own disconnect', async ({ browser }) => {
    test.setTimeout(60_000);

    // B is the host so B is the one allowed to call room:kick at all.
    const B = await makeGuest(browser, 'PlayerB (host)');
    await B.page.goto('/index.html');
    await B.page.click('#btn-create');
    await B.page.click('#modal-advanced-toggle');
    await B.page.locator('#rule-wall').evaluate((el: HTMLInputElement) => {
      if (el.checked) { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await B.page.click('#btn-quick-match');
    await B.page.waitForURL(/room\.html/, { timeout: 15000 });
    const roomId = new URL(B.page.url()).searchParams.get('id');

    const A = await makeGuest(browser, 'PlayerA');
    await A.page.goto(`/room.html?id=${encodeURIComponent(roomId!)}`);
    await expect(A.page.locator('#room-id-nav')).not.toHaveText('', { timeout: 15000 });
    const aUserId = await A.page.evaluate(() => (window as any).RoomState.myUser.userId);

    await B.page.locator('#slot-1 .slot-card__clickable').click();
    await A.page.locator('#slot-2 .slot-card__clickable').click();
    await expect(B.page.locator('#start-modal')).toHaveClass(/visible/, { timeout: 15000 });
    await B.page.click('#start-modal-btn');
    await A.page.click('#start-modal-btn');
    await B.page.waitForFunction(() => (window as any).RoomState?.gameState?.status === 'ongoing', null, { timeout: 20000 });
    await A.page.waitForFunction(() => (window as any).RoomState?.gameState?.status === 'ongoing', null, { timeout: 20000 });

    // A disconnects mid-game (closing the context drops the socket) —
    // DisconnectHandler.startDisconnectGrace flips room.state to
    // 'interrupted' and starts the grace-period clock.
    await A.ctx.close();

    // The server sets room.state = 'interrupted' immediately but only pushes
    // it to clients via 'game:interrupted' (client/js/room-socket.js updates
    // RoomState.gameState.status, not roomData.state) — no room:updated is
    // emitted at grace-start. roomData.state itself is only refreshed on the
    // next room:updated broadcast, so assert on gameState.status here.
    await B.page.waitForFunction(() => (window as any).RoomState?.gameState?.status === 'interrupted', null, { timeout: 10000 });

    // Host attempts to kick the disconnected player while interrupted.
    const kickResult = await B.page.evaluate((targetUserId) => {
      return new Promise((resolve) => {
        const client = (window as any).RoomClient;
        const onError = (d: any) => { cleanup(); resolve({ error: d.message }); };
        const onKicked = () => { cleanup(); resolve({ unexpected: 'room:updated after kick' }); };
        function cleanup() {
          client.socket.off('room:error', onError);
          client.socket.off('room:updated', onKicked);
        }
        client.socket.on('room:error', onError);
        client.socket.on('room:updated', onKicked);
        client.emit('room:kick', { userId: targetUserId });
        setTimeout(() => { cleanup(); resolve({ timedOut: true }); }, 5000);
      });
    }, aUserId);

    expect((kickResult as any).error, 'kick must be rejected while room.state === "interrupted"').toBe('Không thể mời người ra khi đang chơi.');

    // A is still a room member (not actually kicked) — still present in
    // roomData.users with their seat intact.
    const stillMember = await B.page.evaluate(
      (targetUserId) => (window as any).RoomState.roomData.users.some((u: any) => u.userId === targetUserId && u.slot === 2),
      aUserId
    );
    expect(stillMember, 'the disconnected player must remain seated in the room, not removed by the rejected kick').toBe(true);

    await B.ctx.close();
  });
});
