import { test, expect, Page } from '@playwright/test';

/**
 * TEST-MATRIX.md row 7 — Swap2 opening sequence: first player places 3
 * stones (place3) → second player either picks a color outright or places 2
 * more stones themselves (place2) → whoever didn't just choose picks the
 * final color → normal play resumes.
 *
 * Enabled via the `openRule` radio group (`#or-swap2` in the create-room
 * modal, client/index.html) rather than a checkbox like `#rule-wall` —
 * enabling it also forces Wall/Portal off (client/js/lobby.js ~line 370).
 *
 * Server: GameEngine.placeOpeningStone / swap2Choice (server/managers/
 * GameEngine.js ~241-366). Client routes board clicks to `game:swap2_place`
 * instead of `game:move` automatically based on `gameState.swap2.openingPhase`
 * (client/js/game-ui.js onCellClick ~line 97-110) — so opening stones are
 * placed with the same double-click-to-confirm board interaction as a normal
 * move (clickMode defaults to 'double', board.js _handleCellSelect). Color
 * choice buttons (`swap2Choose('white'|'black'|'place')`) render into
 * `#game-controls` only for whichever player currently has the choice.
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

async function placeStone(page: Page, x: number, y: number, expectedCountAfter: number) {
  await page.waitForFunction(() => !!(window as any).RoomState?.boardRenderer?.geo?.cellSize, null, { timeout: 10000 });
  const geo = await page.evaluate(() => (window as any).RoomState.boardRenderer.geo);
  const px = geo.originX + (x + 0.5) * geo.cellSize;
  const py = geo.originY + (y + 0.5) * geo.cellSize;
  await page.locator('#game-canvas').hover({ position: { x: px, y: py } });
  // clickMode defaults to 'double': first click previews the cell, a second
  // click on the same cell confirms placement (board.js _handleCellSelect).
  await page.locator('#game-canvas').click({ position: { x: px, y: py } });
  await page.locator('#game-canvas').click({ position: { x: px, y: py } });
  await page.waitForFunction(
    (n) => (window as any).RoomState?.gameState?.moveCount === n,
    expectedCountAfter,
    { timeout: 10000 }
  );
}

test.describe('Swap2 opening', () => {
  test('place3 → place2 → p1 color choice resolves the opening and normal play resumes', async ({ browser }) => {
    test.setTimeout(60_000);

    const A = await makeGuest(browser, 'PlayerA');
    await A.page.goto('/index.html');
    await A.page.click('#btn-create');
    await A.page.click('#modal-advanced-toggle');
    await A.page.locator('label[for="or-swap2"]').click();
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

    await A.page.waitForFunction(() => (window as any).RoomState?.gameState?.swap2?.enabled === true, null, { timeout: 10000 });
    const swap2 = await A.page.evaluate(() => (window as any).RoomState.gameState.swap2);
    expect(swap2.openingPhase).toBe('place3');

    // instruction.md §B37: the timer must run from the very first opening
    // stone, no exemption for the Swap2 phases — and be visible to the user
    // (turn bar was previously force-hidden during Swap2 via
    // setTurnBarVisible(false), which masked a correctly-ticking server
    // clock; assert both the visibility fix and the ticking itself).
    await expect(A.page.locator('#turn-bar')).not.toHaveClass(/turn-bar--hidden/, { timeout: 10000 });
    const timerBefore = await A.page.evaluate(() => (window as any).RoomState.timerValues);
    expect(timerBefore.black).toBeGreaterThan(0);
    expect(timerBefore.white).toBeGreaterThan(0);

    // firstPlayerId is the "black" placeholder slot and moves first in
    // place3, so its remaining time must actually be ticking down — not
    // frozen the way it was before startTimerForGame() was wired into the
    // Swap2 branch of startGame().
    await A.page.waitForTimeout(2200);
    const timerTicked = await A.page.evaluate(() => (window as any).RoomState.timerValues);
    expect(timerTicked.black).toBeLessThan(timerBefore.black);

    const aId = await A.page.evaluate(() => (window as any).RoomState.myUser.userId);
    const bId = await B.page.evaluate(() => (window as any).RoomState.myUser.userId);
    const first = swap2.firstPlayerId === aId ? A.page : B.page;
    const second = swap2.firstPlayerId === aId ? B.page : A.page;
    expect(swap2.secondPlayerId).toBe(swap2.firstPlayerId === aId ? bId : aId);

    // P1 places 3 opening stones (BLACK, WHITE, BLACK).
    await placeStone(first, 7, 7, 1);
    await placeStone(first, 8, 7, 2);
    await placeStone(first, 7, 8, 3);

    await second.waitForFunction(() => (window as any).RoomState?.gameState?.swap2?.openingPhase === 'p2choice', null, { timeout: 10000 });
    const afterPlace3 = await second.evaluate(() => (window as any).RoomState.gameState);
    expect(afterPlace3.moveCount).toBe(3);
    expect(afterPlace3.currentTurn).toBe(swap2.secondPlayerId);

    // P2 chooses to place 2 more stones instead of picking a color outright.
    await second.evaluate(() => (window as any).swap2Choose('place'));
    await second.waitForFunction(() => (window as any).RoomState?.gameState?.swap2?.openingPhase === 'place2', null, { timeout: 10000 });

    await placeStone(second, 9, 9, 4);
    await placeStone(second, 9, 10, 5);

    await first.waitForFunction(() => (window as any).RoomState?.gameState?.swap2?.openingPhase === 'p1choice', null, { timeout: 10000 });
    const afterPlace2 = await first.evaluate(() => (window as any).RoomState.gameState);
    expect(afterPlace2.moveCount).toBe(5);
    expect(afterPlace2.currentTurn).toBe(swap2.firstPlayerId);

    // P1 makes the final color pick — opening resolves.
    await first.evaluate(() => (window as any).swap2Choose('black'));

    await first.waitForFunction(() => (window as any).RoomState?.gameState?.swap2?.openingPhase === 'play', null, { timeout: 10000 });
    await second.waitForFunction(() => (window as any).RoomState?.gameState?.swap2?.openingPhase === 'play', null, { timeout: 10000 });

    const resolved = await first.evaluate(() => (window as any).RoomState.gameState);
    expect(resolved.swap2.colorsAssigned).toBe(true);
    const firstPlayerColor = resolved.players.find((p: any) => p.userId === swap2.firstPlayerId).color;
    expect(firstPlayerColor).toBe('BLACK');

    // Swap2 rule: WHITE always moves first after resolution — remapForSwap2()
    // must have pinned activeColor to 'white', reflected here as the WHITE
    // player's slot being highlighted as active (turn-bar__active).
    const whitePlayerId = resolved.players.find((p: any) => p.color === 'WHITE').userId;
    expect(resolved.currentTurn).toBe(whitePlayerId);
    await expect(first.locator('#tb-white')).toHaveClass(/turn-bar__active/, { timeout: 5000 });
    await expect(first.locator('#tb-black')).not.toHaveClass(/turn-bar__active/);

    // Normal play resumes: a regular game:move by whoever's turn it now is
    // succeeds and increments moveCount past the 5 opening stones.
    const mover = resolved.currentTurn === swap2.firstPlayerId ? first : second;
    await placeStone(mover, 3, 3, 6);

    await A.ctx.close();
    await B.ctx.close();
  });
});
