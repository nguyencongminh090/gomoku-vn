import { test, expect, Page, BrowserContext } from '@playwright/test';

/**
 * TODO.md #154 — the two-player deadlock #152's gap check could not break.
 *
 * #152 made the *sending* side recoverable and added a receive-side gap check,
 * but that check only fires when a *later* `game:moved` arrives to compare
 * `moveCount` against. With two players alternating strictly, that later
 * broadcast IS the move the stuck player is waiting for. It never arrives, so
 * nothing ever fires: A waits for B, B waits for A, and the only thing that
 * eventually happens is that the stuck player loses on time.
 * `e2e/game-move-ack-resync.spec.ts` scenario 4 could only demonstrate the gap
 * check on a *spectator* for exactly this reason.
 *
 * This is that missing case, and the mandatory one from
 * docs/instruction/B154-*.md: two players, one dropped `game:moved`, and
 * **nobody clicks anything again**. Recovery has to come from the client
 * itself, noticing that the clock it believes is running has burned most of
 * itself away in silence and pulling fresh state rather than trusting it.
 *
 * The room uses a 30 s per-move clock so the run is short: the watchdog is due
 * at three quarters of it (~22 s) rather than ~45 s on the default 60 s clock.
 * That is a shorter time control, not a test hook — the same code path and the
 * same fraction run in production.
 *
 * This test is also the one that caught the first draft of the fix. That draft
 * waited for the watched clock's deadline to *pass*, which is provably sound
 * and uselessly late: the stuck player's own clock is running server-side and
 * expires only a think-time after that deadline, so the player was timed out
 * and lost the game at 14.8 s with the watchdog due at 21 s. Recovery must beat
 * the stuck player's own flag-fall, which is why it now fires at a fraction.
 *
 * Packet loss is simulated the same way as #152's spec, by swallowing an
 * inbound broadcast before any handler sees it.
 *
 * Run against an isolated server instance (own port, own throwaway db) — see
 * the playwright-e2e-safety skill:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3199 npx playwright test \
 *     e2e/turn-watchdog-resync.spec.ts --project=chromium
 */

type Player = { ctx: BrowserContext; page: Page; actor: string; displayName: string };

/** Swallow the next `count` inbound `game:moved` broadcasts before any handler sees them. */
async function dropIncomingMoved(page: Page, count: number) {
  await page.evaluate((n) => {
    const s: any = (window as any).RoomClient.socket;
    const real = s.listeners('game:moved').slice();
    s.off('game:moved');
    let left = n;
    (window as any).__swallowed = 0;
    s.on('game:moved', (data: any) => {
      if (left > 0) { left--; (window as any).__swallowed++; return; }
      for (const fn of real) fn(data);
    });
  }, count);
}

/** Count `game:resync` requests this page sends, from now on. */
async function countResyncs(page: Page) {
  await page.evaluate(() => {
    const s: any = (window as any).RoomClient.socket;
    (window as any).__resyncs = 0;
    if (!s.__origEmit) s.__origEmit = s.emit.bind(s);
    s.emit = (...args: any[]) => {
      if (args[0] === 'game:resync') (window as any).__resyncs++;
      return s.__origEmit(...args);
    };
  });
}

const resyncs = (p: Player) => p.page.evaluate(() => (window as any).__resyncs ?? 0);

test.describe('turn watchdog breaks the two-player deadlock (TODO.md #154)', () => {
  test('a player who misses the opponent\'s move recovers without touching anything', async ({ browser }) => {
    test.setTimeout(180_000);

    const pageErrors: string[] = [];

    async function makeGuest(actor: string): Promise<Player> {
      const ctx = await browser.newContext();
      await ctx.addInitScript(() => {
        localStorage.setItem('gomoku_click_mode', 'single');
      });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => pageErrors.push(`${actor}: ${e.message}`));
      await page.goto('/login.html');
      await page.click('#btn-guest');
      await page.waitForURL((u) => !u.pathname.endsWith('login.html'), { timeout: 20000 });
      const displayName = await page.evaluate(
        () => JSON.parse(localStorage.getItem('gvn_user') || '{}').displayName || '');
      expect(displayName, `${actor} guest login`).toBeTruthy();
      return { ctx, page, actor, displayName };
    }

    // ── A room with a short per-move clock ────────────────────────────────
    const A = await makeGuest('PlayerA');
    await A.page.goto('/index.html');
    await A.page.click('#btn-create');
    await A.page.click('#modal-advanced-toggle');
    await A.page.locator('#rule-wall').evaluate((el: HTMLInputElement) => {
      if (el.checked) { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); }
    });
    await A.page.locator('#timer-seconds').fill('30');
    await A.page.click('#btn-quick-match');
    await A.page.waitForURL(/room\.html\?id=/, { timeout: 15000 });
    const roomId = new URL(A.page.url()).searchParams.get('id')!;

    const B = await makeGuest('PlayerB');
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

    // Confirm the short clock actually took — the whole timing of this test
    // hangs off it, and a silently-ignored setting would make the run pass or
    // fail for the wrong reason.
    const clockSeconds = await A.page.evaluate(
      () => (window as any).RoomState.roomData.settings.timerSeconds);
    expect(clockSeconds, 'room created with the short per-move clock').toBe(30);

    const colorA = await A.page.evaluate(() => {
      const st = (window as any).RoomState;
      return st.gameState.players.find((p: any) => p.userId === st.myUser.userId).color;
    });
    const black = colorA === 'BLACK' ? A : B;
    const white = colorA === 'BLACK' ? B : A;
    const uid = (p: Player) => p.page.evaluate(() => (window as any).RoomState.myUser.userId);
    const blackId = await uid(black);

    async function clickCell(p: Player, id: string, x: number, y: number) {
      await p.page.waitForFunction(
        (u) => (window as any).RoomState?.gameState?.currentTurn === u, id, { timeout: 20000 });
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

    const stoneAt = (p: Player, x: number, y: number) =>
      p.page.evaluate(([cx, cy]) => (window as any).RoomState.gameState.board[cy][cx], [x, y]);
    const moveCount = (p: Player) =>
      p.page.evaluate(() => (window as any).RoomState.gameState.moveCount);
    const turn = (p: Player) =>
      p.page.evaluate(() => (window as any).RoomState.gameState.currentTurn);

    await countResyncs(white.page);

    // ── The deadlock ──────────────────────────────────────────────────────
    // White swallows Black's move entirely. Nothing else will ever arrive:
    // the next broadcast would be White's own reply, and White does not
    // believe it is their turn.
    await dropIncomingMoved(white.page, 1);
    await clickCell(black, blackId, 5, 5);

    await white.page.waitForTimeout(2000);
    expect(await white.page.evaluate(() => (window as any).__swallowed)).toBe(1);
    expect(await stoneAt(white, 5, 5), 'White is genuinely behind').toBe(0);
    expect(await turn(white), 'White still believes it is Black\'s turn').toBe(blackId);
    expect(await resyncs(white), 'nothing has fired yet — this is the deadlock').toBe(0);

    // ── Recovery, with no further input from anyone ───────────────────────
    // Deliberately no clicks from here on. Three quarters into the 30 s clock
    // White believes is running, the watchdog gives up on it and pulls state.
    // Critically this must land BEFORE White's real clock flags at ~30 s, or
    // White simply loses the game — which is the status quo, not a fix.
    await expect.poll(() => stoneAt(white, 5, 5), { timeout: 40000 }).toBe(1);
    expect(await moveCount(white)).toBe(1);
    expect(await turn(white), 'and it is White\'s turn after all').not.toBe(blackId);
    expect(await resyncs(white)).toBeGreaterThan(0);

    // Recovered while the game was still live, not after losing it. Reaching
    // this state via game:ended would mean the watchdog never beat the clock —
    // which is exactly what the first draft of the fix did.
    expect(await white.page.evaluate(
      () => (window as any).RoomState.gameState.status),
      'recovered mid-game, not after flagging').toBe('ongoing');

    const afterRecovery = await resyncs(white);

    // ── And the game simply continues ─────────────────────────────────────
    // Played immediately: White got their turn back with the remainder of a
    // real 30 s clock, and burning it here to watch for resyncs would just
    // lose the game on time for test-harness reasons.
    const whiteId = await uid(white);
    await clickCell(white, whiteId, 12, 5);
    await expect.poll(() => stoneAt(black, 12, 5), { timeout: 15000 }).toBe(2);
    await expect.poll(() => moveCount(black), { timeout: 15000 }).toBe(2);

    // ── It settled instead of looping ─────────────────────────────────────
    // The resync answers with full state, which must reset the baseline rather
    // than read as another gap (#152's bug 7) or re-arm onto an already-spent
    // clock (#154's own version of that trap).
    expect(await resyncs(white) - afterRecovery,
      'no resync storm after recovery').toBeLessThanOrEqual(1);

    expect(pageErrors, 'no uncaught page errors during the run').toEqual([]);

    await A.ctx.close();
    await B.ctx.close();
  });
});
