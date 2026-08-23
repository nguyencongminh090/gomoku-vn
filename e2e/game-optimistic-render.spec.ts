import { test, expect, Page, BrowserContext } from '@playwright/test';

/**
 * TODO.md #153 — optimistic render for the mover's own stone.
 *
 * Before this fix, clicking a cell only emitted `game:move`; the stone —
 * including the mover's OWN — only appeared once the server's `game:moved`
 * broadcast came back, so the full round trip showed up as visible lag on
 * every move (~0.5s for the reporting players) even though nothing in the
 * drawing code itself was slow (traced and ruled out in docs/todo/B153-*.md
 * — BoardRenderer.setState()/_draw() are synchronous, canvas has no
 * per-stone CSS transition).
 *
 * Depends on #152 (ack/timeout/retry/resync) — verified already shipped, see
 * e2e/game-move-ack-resync.spec.ts.
 *
 * Split into three independent tests (each its own 2-player room) rather
 * than one long scenario — an earlier single-test version chained 6
 * sequential browser contexts and proved flaky on generic guest-login/
 * room-creation steps under this environment's resource contention, with
 * no failure ever actually landing inside #153-specific logic. Smaller
 * tests isolate failures and cost less per retry.
 *
 * Run against an isolated server instance (own port, own throwaway db) — see
 * the playwright-e2e-safety skill:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3198 npx playwright test \
 *     e2e/game-optimistic-render.spec.ts --project=chromium
 */

type Player = { ctx: BrowserContext; page: Page; actor: string; displayName: string };

async function makeGuest(browser: any, actor: string): Promise<Player> {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    localStorage.setItem('gomoku_click_mode', 'single');
  });
  const page = await ctx.newPage();
  await page.goto('/login.html');
  await page.click('#btn-guest');
  await page.waitForURL((u: URL) => !u.pathname.endsWith('login.html'), { timeout: 30000 });
  const displayName = await page.evaluate(
    () => JSON.parse(localStorage.getItem('gvn_user') || '{}').displayName || '');
  expect(displayName, `${actor} guest login`).toBeTruthy();
  return { ctx, page, actor, displayName };
}

/**
 * Same as makeGuest, but network latency is applied via CDP BEFORE any
 * navigation happens — including before the page load that triggers
 * socket-early.js's WebSocket handshake. This matters: CDP's
 * Network.emulateNetworkConditions does not retroactively throttle a
 * WebSocket connection that is already open (verified empirically — it DOES
 * throttle a plain fetch() on an already-loaded page, so the mechanism
 * works, it just doesn't apply to live WS traffic). Throttling has to be
 * active from before the handshake for the whole connection, ack included,
 * to actually run at the simulated RTT — see the HONESTY NOTE in the
 * latency test below for why it still doesn't end up mattering.
 */
async function makeGuestThrottled(browser: any, actor: string, latencyMs: number): Promise<Player> {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => {
    localStorage.setItem('gomoku_click_mode', 'single');
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: latencyMs, downloadThroughput: 6_250_000, uploadThroughput: 6_250_000,
  });
  await page.goto('/login.html');
  await page.click('#btn-guest');
  await page.waitForURL((u: URL) => !u.pathname.endsWith('login.html'), { timeout: 30000 });
  const displayName = await page.evaluate(
    () => JSON.parse(localStorage.getItem('gvn_user') || '{}').displayName || '');
  expect(displayName, `${actor} guest login`).toBeTruthy();
  return { ctx, page, actor, displayName };
}

async function clickCell(p: Player, x: number, y: number) {
  await p.page.waitForFunction(
    () => !!(window as any).RoomState?.boardRenderer?.geo?.cellSize, null, { timeout: 10000 });
  const geo = await p.page.evaluate(() => {
    const g = (window as any).RoomState.boardRenderer.geo;
    return { cellSize: g.cellSize, originX: g.originX, originY: g.originY };
  });
  await p.page.locator('#game-canvas').click({
    position: { x: geo.originX + (x + 0.5) * geo.cellSize, y: geo.originY + (y + 0.5) * geo.cellSize },
  });
}

const optimisticStone = (p: Player) =>
  p.page.evaluate(() => (window as any).RoomState.boardRenderer.optimisticStone);
const confirmedStoneAt = (p: Player, x: number, y: number) =>
  p.page.evaluate(([cx, cy]) => (window as any).RoomState.gameState.board[cy][cx], [x, y]);
const moveCount = (p: Player) =>
  p.page.evaluate(() => (window as any).RoomState.gameState.moveCount);

/** Create + join a 2-player room through the real UI, Wall rule off, and start the game. */
async function setUpGame(browser: any, guestFactory: typeof makeGuest): Promise<[Player, Player]> {
  const A = await guestFactory(browser, 'PlayerA');
  await A.page.goto('/index.html');
  await A.page.click('#btn-create');
  await A.page.click('#modal-advanced-toggle');
  await A.page.locator('#rule-wall').evaluate((el: HTMLInputElement) => {
    if (el.checked) { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await A.page.click('#btn-quick-match');
  await A.page.waitForURL(/room\.html\?id=/, { timeout: 15000 });
  const roomId = new URL(A.page.url()).searchParams.get('id')!;

  const B = await guestFactory(browser, 'PlayerB');
  await B.page.goto(`/room.html?id=${encodeURIComponent(roomId)}`);
  await expect(B.page.locator('#room-id-nav')).not.toHaveText('', { timeout: 15000 });

  await A.page.locator('#slot-1 .slot-card__clickable').click();
  await B.page.locator('#slot-2 .slot-card__clickable').click();
  await expect(A.page.locator('#start-modal')).toHaveClass(/visible/, { timeout: 15000 });
  await expect(B.page.locator('#start-modal')).toHaveClass(/visible/, { timeout: 15000 });
  await A.page.click('#start-modal-btn');
  await B.page.click('#start-modal-btn');

  for (const p of [A, B]) {
    await p.page.waitForFunction(
      () => (window as any).RoomState?.gameState?.status === 'ongoing', null, { timeout: 20000 });
  }
  return [A, B];
}

test.describe('optimistic render for the mover\'s own stone (TODO.md #153)', () => {
  test('a real click draws the mover\'s own stone immediately, then confirms via game:moved', async ({ browser }) => {
    test.setTimeout(90_000);

    const [A, B] = await setUpGame(browser, makeGuest);
    const colorA = await A.page.evaluate(() => {
      const st = (window as any).RoomState;
      return st.gameState.players.find((p: any) => p.userId === st.myUser.userId).color;
    });
    const black = colorA === 'BLACK' ? A : B;
    const white = colorA === 'BLACK' ? B : A;

    // Immediate visibility: the ghost appears before the server can possibly
    // have answered, even on localhost's near-zero RTT — polling would pass
    // trivially there, so assert it synchronously right after the click.
    await clickCell(black, 5, 5);
    const stoneRightAfterClick = await optimisticStone(black);
    expect(stoneRightAfterClick).toEqual({ x: 5, y: 5, color: 'BLACK' });

    await expect.poll(() => confirmedStoneAt(white, 5, 5), { timeout: 15000 }).toBe(1);
    await expect.poll(() => optimisticStone(black), { timeout: 15000 }).toBeNull();
    await expect.poll(() => moveCount(black), { timeout: 5000 }).toBe(1);

    // A second move, from the other player, must also work normally — the
    // overlay is per-mover, not a one-shot special case.
    await clickCell(white, 12, 5);
    await expect.poll(() => confirmedStoneAt(black, 12, 5), { timeout: 15000 }).toBe(2);
    await expect.poll(() => optimisticStone(white), { timeout: 15000 }).toBeNull();

    await A.ctx.close();
    await B.ctx.close();
  });

  test('perceived latency under simulated ~500ms RTT', async ({ browser }) => {
    test.setTimeout(90_000);

    // Throttled from BEFORE the socket connects (see makeGuestThrottled) —
    // CDP's Network.emulateNetworkConditions does not retroactively throttle
    // an already-open WebSocket.
    const [E, F] = await setUpGame(browser, (b, actor) => makeGuestThrottled(b, actor, 250));
    const eColor = await E.page.evaluate(() => {
      const st = (window as any).RoomState;
      return st.gameState.players.find((p: any) => p.userId === st.myUser.userId).color;
    });
    const mv = eColor === 'BLACK' ? E : F;
    const ob = eColor === 'BLACK' ? F : E;

    const tClick = Date.now();
    await clickCell(mv, 5, 5);
    // Poll on the OPTIMISTIC field specifically — this is what the fix draws
    // immediately; it must already be set well before a 500ms RTT could have
    // elapsed.
    await expect.poll(() => optimisticStone(mv), { timeout: 2000 }).toEqual({ x: 5, y: 5, color: eColor });
    const tOptimistic = Date.now();

    await expect.poll(() => confirmedStoneAt(ob, 5, 5), { timeout: 15000 }).toBe(eColor === 'BLACK' ? 1 : 2);
    const tConfirmed = Date.now();

    const optimisticMs = tOptimistic - tClick;
    const confirmedMs = tConfirmed - tClick;
    // eslint-disable-next-line no-console
    console.log(`[#153] optimistic=${optimisticMs}ms, server-confirmed=${confirmedMs}ms ` +
      `(CDP latency=250ms requested; see the honesty note below on why confirmedMs doesn't reflect it)`);

    // The optimistic stone must appear well before any round trip could
    // possibly have completed — it is drawn locally, synchronously, with no
    // network involved. This holds regardless of actual RTT: sendMove()
    // calls setOptimisticStone() before it calls emitAck(), full stop, so
    // "optimistic paint has zero network dependency" is an architectural
    // guarantee, not something that needs a slow network to demonstrate.
    expect(optimisticMs).toBeLessThan(150);

    // HONESTY NOTE (CLAUDE.md precedent #126 — say so plainly when a number
    // can't be measured, rather than silently dropping the check): the
    // instruction asks to verify under simulated ~500ms RTT and measure
    // before/after. `confirmedMs` above is NOT ~500ms despite `latency: 250`
    // being requested via CDP `Network.emulateNetworkConditions`, applied
    // BEFORE the socket ever connects (see makeGuestThrottled) — confirmed
    // this is not a setup mistake by throttling a plain `fetch()` on an
    // already-loaded page under the identical CDP call, which DID measure
    // ~262ms for a 250ms configured latency. WebSocket data frames simply do
    // not go through Chromium's NetworkConditions emulation at all (a known
    // CDP/Chromium limitation, not specific to this app or this harness) —
    // there is no supported way to add artificial delay to an active
    // socket.io connection's frames via Playwright/CDP. `confirmedMs` above
    // is genuinely just this environment's localhost RTT, not the simulated
    // one, and must not be read as "confirmation only took tens of ms under
    // 500ms RTT" — it's "confirmedMs could not be forced away from localhost
    // speed." What IS verified, unconditionally: optimisticMs has no network
    // dependency by construction, so under a real ~500ms RTT it would still
    // be ~0ms while confirmedMs would be ~500ms — the same gap this test
    // demonstrates at localhost scale (optimisticMs ≈ confirmedMs here only
    // because nothing throttled either of them; the CODE PATH that makes
    // optimisticMs win is unaffected by network speed).

    await E.ctx.close();
    await F.ctx.close();
  });

  test('rollback on a genuine ack rejection leaves no trace', async ({ browser }) => {
    test.setTimeout(90_000);

    // board.js's own click gate covers turn/occupied/bounds client-side (so
    // those errors can never reach sendMove via a real click — matching
    // #153's "no GameEngine logic duplicated client-side" boundary). A rule
    // board.js does NOT know about is reachable: enable Wall and click
    // outside the server-computed first-move zone.
    const C = await makeGuest(browser, 'PlayerC');
    await C.page.goto('/index.html');
    await C.page.click('#btn-create');
    await C.page.click('#modal-advanced-toggle');
    await C.page.locator('#rule-wall').evaluate((el: HTMLInputElement) => {
      if (!el.checked) { el.checked = true; el.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await C.page.click('#btn-quick-match');
    await C.page.waitForURL(/room\.html\?id=/, { timeout: 15000 });
    const roomId = new URL(C.page.url()).searchParams.get('id')!;

    const D = await makeGuest(browser, 'PlayerD');
    await D.page.goto(`/room.html?id=${encodeURIComponent(roomId)}`);
    await expect(D.page.locator('#room-id-nav')).not.toHaveText('', { timeout: 15000 });
    await C.page.locator('#slot-1 .slot-card__clickable').click();
    await D.page.locator('#slot-2 .slot-card__clickable').click();
    await expect(C.page.locator('#start-modal')).toHaveClass(/visible/, { timeout: 15000 });
    await C.page.click('#start-modal-btn');
    await D.page.click('#start-modal-btn');
    await C.page.waitForFunction(
      () => (window as any).RoomState?.gameState?.status === 'ongoing', null, { timeout: 20000 });

    const mover = (await C.page.evaluate(() => {
      const st = (window as any).RoomState;
      return st.gameState.currentTurn === st.myUser.userId;
    })) ? C : D;

    const zones: { x: number; y: number }[] = await mover.page.evaluate(
      () => (window as any).RoomState.gameState.firstMoveZones);
    const boardSize: number = await mover.page.evaluate(
      () => (window as any).RoomState.gameState.boardSize);
    const zoneSet = new Set(zones.map(z => `${z.x},${z.y}`));
    let outside: { x: number; y: number } | null = null;
    for (let y = 0; y < boardSize && !outside; y++) {
      for (let x = 0; x < boardSize; x++) {
        if (!zoneSet.has(`${x},${y}`)) { outside = { x, y }; break; }
      }
    }
    expect(outside, 'the board must have at least one cell outside every first-move zone').toBeTruthy();

    const boardBefore = await mover.page.evaluate(() => JSON.stringify((window as any).RoomState.gameState.board));
    await clickCell(mover, outside!.x, outside!.y);

    // The rejection round-trips (real ack), so the rollback isn't instant —
    // poll for it, then confirm nothing was left behind.
    await expect.poll(() => optimisticStone(mover), { timeout: 15000 }).toBeNull();
    const boardAfter = await mover.page.evaluate(() => JSON.stringify((window as any).RoomState.gameState.board));
    expect(boardAfter).toBe(boardBefore);
    await expect(mover.page.locator('#chat-messages')).toContainText(/tường|adjacent/i, { timeout: 5000 });

    await C.ctx.close();
    await D.ctx.close();
  });
});
