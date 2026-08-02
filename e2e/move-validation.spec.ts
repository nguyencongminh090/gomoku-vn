import { test, expect, Page } from '@playwright/test';

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
  const res = await page.request.post('/api/auth/guest');
  expect(res.ok(), `${actor} guest auth should succeed`).toBeTruthy();
  const { token, displayName } = await res.json();
  await ctx.addInitScript(([t, d]) => {
    localStorage.setItem('gvn_token', t as string);
    localStorage.setItem('gvn_display_name', d as string);
  }, [token, displayName]);
  return { ctx, page, actor, displayName };
}

/** Emit game:move via the page's own RoomClient and resolve with either the error or the accepted move data. */
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
    await A.page.waitForURL(/room\.html/, { timeout: 15000 });
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

    // 3) Occupied cell: WHITE's turn now — try (5,5) again, already taken.
    const occupied = await emitMove(white.page, 5, 5);
    expect((occupied as any).error, 'moving onto an occupied cell must be rejected').toBeTruthy();
    moveCount = await A.page.evaluate(() => (window as any).RoomState.gameState.moveCount);
    expect(moveCount, 'rejected occupied-cell move must not change moveCount').toBe(1);

    // 4) WHITE makes a legitimate move elsewhere so it's BLACK's turn again.
    const legit2 = await emitMove(white.page, 6, 6);
    expect((legit2 as any).moved).toBeTruthy();

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
    await A.page.waitForURL(/room\.html/, { timeout: 15000 });
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
