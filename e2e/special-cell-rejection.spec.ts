import { test, expect, Page } from '@playwright/test';

/**
 * TEST-MATRIX.md rows 4 & 5 — placing directly on a wall cell (`-1`) or a
 * portal cell (`-2`) is rejected. GameEngine.makeMove's occupied-cell check
 * (server/managers/GameEngine.js ~line 168-173) runs BEFORE the first-move-
 * zone check, so a wall/portal cell is rejected on the very first move too —
 * no need to make a legitimate move first.
 *
 * The real board UI can't even attempt this: board.js `_onClick` only calls
 * `onCellClick` when `board[cell.y][cell.x] === 0`, so a wall/portal cell
 * silently no-ops a click client-side. This talks to the already-connected
 * `window.RoomClient` socket directly (same pattern as move-validation.spec.ts)
 * to drive the server-side guard the UI masks.
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

async function emitMove(page: Page, x: number, y: number) {
  return page.evaluate(([mx, my]) => {
    return new Promise((resolve) => {
      const client = (window as any).RoomClient;
      const onError = (d: any) => { cleanup(); resolve({ error: d.message }); };
      const onMoved = (d: any) => { cleanup(); resolve({ moved: d }); };
      function cleanup() {
        client.socket.off('game:error', onError);
        client.socket.off('game:moved', onMoved);
      }
      client.on('game:error', onError);
      client.on('game:moved', onMoved);
      client.emit('game:move', { x: mx, y: my });
      setTimeout(() => { cleanup(); resolve({ timedOut: true }); }, 5000);
    });
  }, [x, y]);
}

test.describe('Special-rule cell rejection', () => {
  test('placing on a wall cell or a portal cell is rejected without mutating the board', async ({ browser }) => {
    test.setTimeout(60_000);

    const A = await makeGuest(browser, 'PlayerA');
    await A.page.goto('/index.html');
    await A.page.click('#btn-create');
    await A.page.click('#modal-advanced-toggle');
    // Enable both Wall and Portal — both are custom-toggle checkboxes (zero-size,
    // out of viewport), so set .checked + dispatch 'change' directly.
    await A.page.locator('#rule-wall').evaluate((el: HTMLInputElement) => {
      if (!el.checked) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await A.page.locator('#rule-portal').evaluate((el: HTMLInputElement) => {
      if (!el.checked) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await A.page.click('#btn-quick-match');
    await A.page.waitForURL(/room\.html\?id=/, { timeout: 15000 });
    const roomId = new URL(A.page.url()).searchParams.get('id');

    const B = await makeGuest(browser, 'PlayerB');
    await B.page.goto(`/room.html?id=${encodeURIComponent(roomId!)}`);
    await expect(B.page.locator('#room-id-nav')).not.toHaveText('', { timeout: 15000 });

    await A.page.locator('#slot-1 .slot-card__clickable').click();
    await B.page.locator('#slot-2 .slot-card__clickable').click();
    await expect(A.page.locator('#start-modal')).toHaveClass(/visible/, { timeout: 15000 });
    await A.page.click('#start-modal-btn');
    await B.page.click('#start-modal-btn');
    await A.page.waitForFunction(() => (window as any).RoomState?.gameState?.status === 'ongoing', null, { timeout: 20000 });
    await B.page.waitForFunction(() => (window as any).RoomState?.gameState?.status === 'ongoing', null, { timeout: 20000 });

    const { walls, portals, colorA } = await A.page.evaluate(() => {
      const st = (window as any).RoomState;
      const me = st.gameState.players.find((p: any) => p.userId === st.myUser.userId);
      return { walls: st.gameState.walls, portals: st.gameState.portals, colorA: me.color };
    });
    expect(walls.length, 'wall rule was on — walls should be generated').toBeGreaterThan(0);
    expect(portals.length, 'portal rule was on — portal pairs should be generated').toBeGreaterThan(0);

    const black = colorA === 'BLACK' ? A : B;

    // 1) Placing on a wall cell is rejected — BLACK moves first.
    const wallCell = walls[0];
    const wallResult = await emitMove(black.page, wallCell.x, wallCell.y);
    expect((wallResult as any).error, 'placing on a wall cell must be rejected').toBeTruthy();
    let moveCount = await A.page.evaluate(() => (window as any).RoomState.gameState.moveCount);
    expect(moveCount, 'rejected wall-cell move must not mutate state').toBe(0);

    // 2) Placing on a portal cell is rejected too — still BLACK's turn since
    //    the wall attempt above was rejected, not consumed.
    const portalPair = portals[0];
    const portalCell = portalPair.a || portalPair[0];
    const portalResult = await emitMove(black.page, portalCell.x, portalCell.y);
    expect((portalResult as any).error, 'placing on a portal cell must be rejected').toBeTruthy();
    moveCount = await A.page.evaluate(() => (window as any).RoomState.gameState.moveCount);
    expect(moveCount, 'rejected portal-cell move must not mutate state').toBe(0);

    await A.ctx.close();
    await B.ctx.close();
  });
});
