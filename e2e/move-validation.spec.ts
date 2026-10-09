import { test, expect, Page } from './helpers/fixtures';
import { authAsGuest } from './helpers/auth';

/**
 * TEST-MATRIX.md rows 24-27 — GameEngine.makeMove's validation guards
 * (server/managers/GameEngine.js ~line 146-181): out-of-turn, occupied cell,
 * out-of-bounds coordinates, and (row 27) a move attempted after the game
 * has already finished (`this.status !== 'ongoing'` check, ~line 153-155).
 * The board UI already prevents most of these by construction (clicks are
 * gated on `isMyTurn`/`interactive`, and the canvas can't produce
 * out-of-range coordinates) — so this spec talks to the already-connected
 * `window.RoomClient` socket directly, the same object the real UI uses, to
 * drive the server-side guards the UI would otherwise mask.
 */

async function makeGuest(browser: any, actor: string) {
  const ctx = await browser.newContext();
  const page: Page = await ctx.newPage();
  const { displayName } = await authAsGuest(ctx, page);
  return { ctx, page, actor, displayName };
}

/**
 * Emit game:move via the page's own RoomClient and resolve with that emit's
 * own ack: `{ error }` if rejected, `{ moved }` if accepted (TODO.md #185).
 * Not the game:moved/game:error broadcasts: game:moved goes to the whole
 * room, so the opponent's copy of the previous move could land after this
 * call's listener attached and be mistaken for this move's answer.
 */
async function emitMove(page: Page, x: number, y: number) {
  return page.evaluate(([mx, my]) => {
    return new Promise((resolve) => {
      (window as any).RoomClient.emitAck('game:move', { x: mx, y: my }, 5000, (err: any, res: any) => {
        if (err) resolve({ timedOut: true });
        else if (res && res.error) resolve({ error: res.error });
        else resolve({ moved: res });
      });
    });
  }, [x, y]);
}

/** Wait until both players' local state has applied `n` moves. */
async function waitMoveCount(pages: Page[], n: number) {
  for (const p of pages) {
    await p.waitForFunction((c) => (window as any).RoomState.gameState.moveCount === c, n, { timeout: 10000 });
  }
}

test.describe('Move validation', () => {
  // Both tests create their own room from this local IP — serial avoids
  // tripping MAX_ROOMS_PER_IP (=3, server/config.js) under parallel workers.
  test.describe.configure({ mode: 'serial' });

  test('out-of-turn, occupied-cell, and out-of-bounds moves are all rejected without mutating state', async ({ browser }) => {
    test.setTimeout(60_000);

    const A = await makeGuest(browser, 'PlayerA');
    await A.page.goto('/index.html');
    await A.page.click('#btn-create');
    await A.page.click('#modal-advanced-toggle');
    await A.page.locator('#rule-wall').evaluate((el: HTMLInputElement) => {
      if (el.checked) { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); }
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

    const colorA = await A.page.evaluate(() => {
      const st = (window as any).RoomState;
      return st.gameState.players.find((p: any) => p.userId === st.myUser.userId).color;
    });
    const black = colorA === 'BLACK' ? A : B;
    const white = colorA === 'BLACK' ? B : A;

    // 1) Out-of-turn: WHITE tries to move before BLACK (who always moves
    //    first) has moved at all.
    const outOfTurn = await emitMove(white.page, 5, 5);
    expect((outOfTurn as any).error, 'moving out of turn must be rejected').toBeTruthy();
    let moveCount = await A.page.evaluate(() => (window as any).RoomState.gameState.moveCount);
    expect(moveCount).toBe(0);

    // 2) BLACK makes a legitimate move at (5,5).
    const legit = await emitMove(black.page, 5, 5);
    expect((legit as any).moved).toBeTruthy();
    await waitMoveCount([A.page, B.page], 1);

    // 3) Occupied cell: WHITE's turn now — try (5,5) again, already taken.
    const occupied = await emitMove(white.page, 5, 5);
    expect((occupied as any).error, 'moving onto an occupied cell must be rejected').toBeTruthy();
    moveCount = await A.page.evaluate(() => (window as any).RoomState.gameState.moveCount);
    expect(moveCount, 'rejected occupied-cell move must not change moveCount').toBe(1);

    // 4) WHITE makes a legitimate move elsewhere so it's BLACK's turn again.
    const legit2 = await emitMove(white.page, 6, 6);
    expect((legit2 as any).moved).toBeTruthy();
    await waitMoveCount([A.page, B.page], 2);

    // 5) Out-of-bounds: BLACK's turn — negative coordinate, unreachable via
    //    the real canvas UI but must still be rejected server-side.
    const outOfBounds = await emitMove(black.page, -1, 0);
    expect((outOfBounds as any).error, 'out-of-bounds coordinates must be rejected').toBeTruthy();
    moveCount = await A.page.evaluate(() => (window as any).RoomState.gameState.moveCount);
    expect(moveCount, 'rejected out-of-bounds move must not change moveCount').toBe(2);

    await A.ctx.close();
    await B.ctx.close();
  });

  test('a move attempted after the game has already finished is rejected', async ({ browser }) => {
    test.setTimeout(60_000);

    const A = await makeGuest(browser, 'PlayerA');
    await A.page.goto('/index.html');
    await A.page.click('#btn-create');
    await A.page.click('#modal-advanced-toggle');
    await A.page.locator('#rule-wall').evaluate((el: HTMLInputElement) => {
      if (el.checked) { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); }
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

    // End the game via resign — doesn't require it to be the resigner's turn.
    A.page.on('dialog', (d) => d.accept());
    await expect(A.page.locator('.btn-game--resign')).toBeVisible({ timeout: 10000 });
    await A.page.click('.btn-game--resign');
    await A.page.waitForFunction(() => (window as any).RoomState?.gameState?.status === 'finished', null, { timeout: 10000 });
    await B.page.waitForFunction(() => (window as any).RoomState?.gameState?.status === 'finished', null, { timeout: 10000 });

    const moveCountBefore = await B.page.evaluate(() => (window as any).RoomState.gameState.moveCount);

    // B (the non-resigning winner) attempts a move on the now-finished game.
    const result = await emitMove(B.page, 3, 3);
    expect((result as any).error, 'a move on a finished game must be rejected').toBeTruthy();
    const moveCountAfter = await B.page.evaluate(() => (window as any).RoomState.gameState.moveCount);
    expect(moveCountAfter, 'rejected post-finish move must not mutate state').toBe(moveCountBefore);

    await A.ctx.close();
    await B.ctx.close();
  });
});
