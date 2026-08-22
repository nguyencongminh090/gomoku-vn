import { test, expect, Page } from '@playwright/test';

/**
 * TEST-MATRIX.md row 28 — two rapid same-tick moves from both players: only
 * one is ever applied, the board never ends up with two stones from a single
 * contested tick.
 *
 * GameEngine.makeMove (server/managers/GameEngine.js ~146-225) and its
 * socket.on('game:move', ...) caller (server/socket/handlers/GameHandler.js
 * ~51-111) are both fully synchronous — no await between reading
 * `this.currentTurn` and mutating the board — so Node's single-threaded
 * event loop already serializes any two `game:move` emissions completely,
 * regardless of how close together they land on the wire.
 *
 * Both attempts target the SAME cell deliberately. Firing at two different
 * cells doesn't actually exercise a race: turn alternates after every ply,
 * so if the current-turn player's move is processed first, the turn flips
 * to the other player BEFORE their "out of turn" attempt is processed —
 * making it a legitimately-timed, valid move too (both succeed, at
 * different cells — confirmed empirically). Racing for the same cell is
 * the version of this scenario where only one placement can ever win no
 * matter the arrival order: whichever attempt is processed second is
 * rejected either for turn (`'Chưa đến lượt bạn.'`, if it arrives before
 * the first is applied) or for the now-occupied cell
 * (`'Ô này đã có quân.'`, if it arrives after) — the exact reason is an
 * arrival-order artifact, but exactly one stone must land either way.
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

function attemptMove(page: Page, coord: { x: number; y: number }) {
  return page.evaluate((c) => {
    return new Promise((resolve) => {
      const s = (window as any).RoomClient.socket;
      // Both attempts target the same cell, so a 'game:moved' broadcast
      // matching this coord is ambiguous — it fires once for whichever
      // attempt actually landed, and both sockets (being in the same room)
      // receive it regardless of whose move it was. 'game:error', in
      // contrast, is only ever sent to the socket whose own attempt was
      // rejected — so absence of an error within the window is exactly
      // "this attempt's own emit is the one that landed".
      function onError(d: any) { cleanup(); resolve({ error: d.message }); }
      function cleanup() { s.off('game:error', onError); }
      s.on('game:error', onError);
      s.emit('game:move', { x: c.x, y: c.y });
      setTimeout(() => { cleanup(); resolve({ moved: true }); }, 3000);
    });
  }, coord);
}

test.describe('Concurrent same-tick moves', () => {
  test('only the current-turn player\'s move is applied when both fire at once', async ({ browser }) => {
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
    await A.page.waitForFunction(() => !!(window as any).RoomState?.gameState?.currentTurn, null, { timeout: 10000 });

    // Both players attempt a move at the SAME instant, targeting the SAME
    // cell — see header comment for why different cells don't actually race.
    const coord = { x: 7, y: 7 };
    const [resA, resB] = await Promise.all([
      attemptMove(A.page, coord),
      attemptMove(B.page, coord),
    ]);

    // Exactly one of the two attempts is rejected; the other lands. Both
    // succeeding, or both failing, would mean the server double-applied (or
    // dropped) a contested move.
    const errored = [resA, resB].filter((r) => !!r.error);
    const succeeded = [resA, resB].filter((r) => r.moved === true);
    expect(errored.length, `exactly one of the two contesting attempts should be rejected; got A=${JSON.stringify(resA)} B=${JSON.stringify(resB)}`).toBe(1);
    expect(succeeded.length, `exactly one of the two contesting attempts should succeed; got A=${JSON.stringify(resA)} B=${JSON.stringify(resB)}`).toBe(1);
    expect(['Chưa đến lượt bạn.', 'Ô này đã có quân.']).toContain(errored[0].error);

    // Exactly one stone landed on the contested cell — never two, never none.
    await A.page.waitForFunction(() => (window as any).RoomState?.gameState?.moveCount === 1, null, { timeout: 10000 });
    const finalState = await A.page.evaluate(() => (window as any).RoomState.gameState);
    expect(finalState.moveCount).toBe(1);
    expect(finalState.board[coord.y][coord.x]).not.toBe(0);

    await A.ctx.close();
    await B.ctx.close();
  });
});
