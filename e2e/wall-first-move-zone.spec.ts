import { test, expect, Page } from '@playwright/test';

/**
 * TEST-MATRIX.md row 3/4 — Wall rule: the first move of the game must land in
 * one of GameEngine's `firstMoveZones` cells (the 8 cells surrounding each
 * wall). GameEngine.makeMove (server/managers/GameEngine.js ~line 176-181)
 * rejects any other first move with an error, without mutating the board.
 *
 * Unlike the other new specs, this one deliberately leaves the Wall toggle
 * ON (it's the lite lobby default — see TODO.md #18) instead of forcing it
 * off, since Wall is exactly what's under test here.
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
    localStorage.setItem('gomoku_click_mode', 'single');
  }, [token, displayName]);
  return { ctx, page, actor, displayName };
}

async function clickCell(page: Page, x: number, y: number) {
  await page.waitForFunction(() => !!(window as any).RoomState?.boardRenderer?.geo?.cellSize, null, { timeout: 10000 });
  const geo = await page.evaluate(() => {
    const br = (window as any).RoomState.boardRenderer;
    return { cellSize: br.geo.cellSize, originX: br.geo.originX, originY: br.geo.originY };
  });
  const px = geo.originX + (x + 0.5) * geo.cellSize;
  const py = geo.originY + (y + 0.5) * geo.cellSize;
  await page.locator('#game-canvas').click({ position: { x: px, y: py } });
}

test.describe('Wall rule — first-move zone enforcement', () => {
  test('a first move outside every firstMoveZone is rejected; a move inside one succeeds', async ({ browser }) => {
    test.setTimeout(60_000);

    const A = await makeGuest(browser, 'PlayerA');
    await A.page.goto('/index.html');
    await expect(A.page.locator('#btn-create')).toBeVisible();
    await A.page.click('#btn-create');
    // Leave Wall ON (lite default) — do NOT toggle it off here, unlike other specs.
    await A.page.click('#btn-quick-match');
    await A.page.waitForURL(/room\.html/, { timeout: 15000 });
    const roomId = new URL(A.page.url()).searchParams.get('id');
    expect(roomId).toBeTruthy();

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

    const { walls, firstMoveZones, boardSize, blackIsA } = await A.page.evaluate(() => {
      const st = (window as any).RoomState;
      const me = st.gameState.players.find((p: any) => p.userId === st.myUser.userId);
      return {
        walls: st.gameState.walls,
        firstMoveZones: st.gameState.firstMoveZones,
        boardSize: st.gameState.boardSize,
        blackIsA: me.color === 'BLACK',
      };
    });
    expect(walls.length, 'wall rule was on — walls should be generated').toBeGreaterThan(0);
    expect(firstMoveZones.length).toBeGreaterThan(0);

    const blackPage = blackIsA ? A.page : B.page;
    const occupied = new Set<string>([
      ...walls.map((w: any) => `${w.x},${w.y}`),
      ...firstMoveZones.map((z: any) => `${z.x},${z.y}`),
    ]);

    // Find a cell that's empty, not a wall, and NOT in any first-move zone —
    // scan from the corner outward, since walls keep WALL_EDGE_MIN_DIST=4
    // from every edge (server/config.js), so a true corner is always safe.
    let outsideZone: { x: number; y: number } | null = null;
    for (let y = 0; y < boardSize && !outsideZone; y++) {
      for (let x = 0; x < boardSize && !outsideZone; x++) {
        if (!occupied.has(`${x},${y}`)) outsideZone = { x, y };
      }
    }
    expect(outsideZone, 'expected at least one cell outside every first-move zone').toBeTruthy();

    // 1) Move outside every zone must be rejected — chat shows the error,
    //    board stays untouched (moveCount stays 0).
    await clickCell(blackPage, outsideZone!.x, outsideZone!.y);
    await expect(blackPage.locator('#chat-messages')).toContainText('phải đặt cạnh một ô tường', { timeout: 10000 });
    const moveCountAfterReject = await blackPage.evaluate(() => (window as any).RoomState.gameState.moveCount);
    expect(moveCountAfterReject, 'rejected move must not mutate board state').toBe(0);

    // 2) A move inside a first-move zone succeeds.
    const zoneCell = firstMoveZones[0];
    await clickCell(blackPage, zoneCell.x, zoneCell.y);
    await blackPage.waitForFunction((bc) => (window as any).RoomState?.gameState?.moveCount > bc, 0, { timeout: 10000 });
    const moveCountAfterAccept = await blackPage.evaluate(() => (window as any).RoomState.gameState.moveCount);
    expect(moveCountAfterAccept).toBe(1);

    await A.ctx.close();
    await B.ctx.close();
  });
});
