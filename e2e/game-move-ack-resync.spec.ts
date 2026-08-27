import { test, expect, Page, BrowserContext } from '@playwright/test';

/**
 * TODO.md #152 — `game:move` recovers from a silently dropped packet.
 *
 * Before this fix a move was a bare fire-and-forget emit, and the stone was
 * only ever drawn when the server's `game:moved` broadcast came back. If
 * either packet was dropped while the WebSocket itself stayed up — the
 * selective-loss pattern reported by players on lossy networks, which no
 * disconnect/reconnect resync ever fires for — the board froze with no error,
 * no spinner, and no way out but a reload.
 *
 * The three scenarios below each drop a real packet mid-game and assert the
 * player gets out of it. Loss is simulated by patching socket.io-client's
 * `Socket#packet`, which runs *after* `emit()` has already assigned the ack id
 * and armed its timeout (socket.js `_registerAckCallback` then `this.packet`),
 * so the client is in exactly the state a genuinely lost packet leaves it in
 * — as opposed to stubbing `emit()`, which would suppress the timeout too and
 * simulate nothing.
 *
 * Run against an isolated server instance (own port, own throwaway db) — see
 * the playwright-e2e-safety skill:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3199 npx playwright test \
 *     e2e/game-move-ack-resync.spec.ts --project=chromium
 */

type Player = { ctx: BrowserContext; page: Page; actor: string; displayName: string };

/** Drop the next `count` outgoing packets for `event` at the wire layer. */
async function dropOutgoing(page: Page, event: string, count: number) {
  await page.evaluate(([ev, n]) => {
    const s: any = (window as any).RoomClient.socket;
    if (!s.__origPacket) s.__origPacket = s.packet.bind(s);
    let left = n as number;
    (window as any).__dropped = 0;
    s.packet = (packet: any) => {
      if (left > 0 && packet.data && packet.data[0] === ev) {
        left--;
        (window as any).__dropped++;
        return;
      }
      s.__origPacket(packet);
    };
  }, [event, count] as [string, number]);
}

async function stopDropping(page: Page) {
  await page.evaluate(() => {
    const s: any = (window as any).RoomClient.socket;
    if (s.__origPacket) s.packet = s.__origPacket;
  });
}

/** Swallow the next `count` inbound `game:moved` broadcasts before any handler sees them. */
async function dropIncomingMoved(page: Page, count: number) {
  await page.evaluate((n) => {
    const s: any = (window as any).RoomClient.socket;
    const real = s.listeners('game:moved').slice();
    s.off('game:moved');
    let left = n;
    s.on('game:moved', (data: any) => {
      if (left > 0) { left--; return; }
      for (const fn of real) fn(data);
    });
  }, count);
}

async function chatText(page: Page) {
  return page.locator('#chat-messages').innerText();
}

test.describe('game:move ack / retry / resync (TODO.md #152)', () => {
  test('a dropped move packet recovers instead of freezing the board', async ({ browser }) => {
    test.setTimeout(180_000);

    const pageErrors: string[] = [];

    // Drive the real guest-login button rather than POSTing /api/auth/guest.
    // The session cookie is HttpOnly, so `requireAuth()` gates on the
    // `gvn_user` flag that only login.js's success path writes — seeding the
    // legacy token keys instead leaves that unset and every guarded page
    // bounces back to login.
    async function makeGuest(actor: string): Promise<Player> {
      const ctx = await browser.newContext();
      await ctx.addInitScript(() => {
        // Single-tap placement: a scripted click is precise, so the default
        // double-tap confirm just costs an extra click per move.
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

    // ── Set up a normal game through the real UI ──────────────────────────
    const A = await makeGuest('PlayerA');
    await A.page.goto('/index.html');
    await A.page.click('#btn-create');
    await A.page.click('#modal-advanced-toggle');
    // Wall on would confine the first move to a random zone; this test needs
    // to place stones at chosen coordinates.
    await A.page.locator('#rule-wall').evaluate((el: HTMLInputElement) => {
      if (el.checked) { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); }
    });
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

    const colorA = await A.page.evaluate(() => {
      const st = (window as any).RoomState;
      return st.gameState.players.find((p: any) => p.userId === st.myUser.userId).color;
    });
    const black = colorA === 'BLACK' ? A : B;
    const white = colorA === 'BLACK' ? B : A;
    const uid = (p: Player) => p.page.evaluate(() => (window as any).RoomState.myUser.userId);
    const blackId = await uid(black);
    const whiteId = await uid(white);

    /** Click a cell on the canvas the way a player does — no direct emits. */
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

    // ── 1. Baseline: an undisturbed move still works ──────────────────────
    await clickCell(black, blackId, 5, 5);
    await expect.poll(() => stoneAt(white, 5, 5), { timeout: 15000 }).toBe(1);
    await expect.poll(() => moveCount(black), { timeout: 15000 }).toBe(1);

    // ── 2. The move packet is lost; the retry (same moveId) lands it ───────
    await dropOutgoing(white.page, 'game:move', 1);
    await clickCell(white, whiteId, 12, 5);
    expect(await white.page.evaluate(() => (window as any).__dropped)).toBe(1);

    // Nothing happens for the first 5 s — the packet is simply gone. The
    // retry then goes through and the stone appears, without the player
    // having done anything.
    await expect.poll(() => stoneAt(white, 12, 5), { timeout: 20000 }).toBe(2);
    await expect.poll(() => stoneAt(black, 12, 5), { timeout: 15000 }).toBe(2);
    await expect.poll(() => moveCount(white), { timeout: 15000 }).toBe(2);
    // …and exactly one stone was placed, not two: the server recognised the
    // retry's moveId if the original had in fact landed.
    await expect.poll(() => moveCount(black), { timeout: 15000 }).toBe(2);
    // The player was told what was happening rather than left staring.
    expect(await chatText(white.page)).toMatch(/thử gửi lại|Retrying/i);
    await stopDropping(white.page);

    // ── 3. Every move packet is lost: two timeouts, then resync, no freeze ─
    await dropOutgoing(black.page, 'game:move', 99);
    await clickCell(black, blackId, 5, 6);

    // ~10 s (2 x 5 s) later the client gives up retrying and pulls fresh
    // state instead of waiting forever.
    await expect.poll(() => chatText(black.page), { timeout: 30000 })
      .toMatch(/đồng bộ lại|Resyncing/i);
    // The stone never landed — correctly, the server never saw it — but the
    // board is consistent with the server rather than stuck mid-action.
    expect(await stoneAt(black, 5, 6)).toBe(0);
    await expect.poll(() => moveCount(black), { timeout: 15000 }).toBe(2);
    expect(await black.page.evaluate(
      () => (window as any).RoomState.gameState.currentTurn)).toBe(blackId);

    // And the player can simply play again once the network recovers.
    await stopDropping(black.page);
    await clickCell(black, blackId, 5, 6);
    await expect.poll(() => stoneAt(white, 5, 6), { timeout: 15000 }).toBe(1);

    // ── 4. A dropped broadcast is noticed and pulled back ─────────────────
    // Receive-side loss: `moveCount` skipping a number means a `game:moved`
    // never arrived, so the delta must not be applied on top of the wrong
    // base — the client asks for full state instead.
    //
    // Demonstrated on a spectator rather than on the opponent, because the
    // check can only fire on the *next* broadcast to arrive: two players in
    // strict alternation produce no such broadcast (see the note in
    // docs/todo/B152-*.md — the residual two-player case is filed separately).
    const C = await makeGuest('Spectator');
    await C.page.goto(`/room.html?id=${encodeURIComponent(roomId)}`);
    await C.page.waitForFunction(
      () => (window as any).RoomState?.gameState?.status === 'ongoing', null, { timeout: 20000 });

    await dropIncomingMoved(C.page, 1);

    await clickCell(white, whiteId, 12, 6);        // spectator swallows this one
    await white.page.waitForTimeout(1000);
    expect(await stoneAt(C, 12, 6)).toBe(0);       // genuinely behind now

    await clickCell(black, blackId, 5, 7);         // moveCount now skips → resync
    // Five moves have landed by now: (5,5) (12,5) (5,6) (12,6) (5,7). The
    // spectator saw four of them and gets the fifth — plus the one it missed
    // — from the resync.
    await expect.poll(() => stoneAt(C, 12, 6), { timeout: 20000 }).toBe(2);
    await expect.poll(() => stoneAt(C, 5, 7), { timeout: 20000 }).toBe(1);
    await expect.poll(() => moveCount(C), { timeout: 20000 }).toBe(5);
    await expect.poll(() => moveCount(black), { timeout: 20000 }).toBe(5);

    // The resync must settle, not retrigger itself on the full state it
    // returns — that loop is the trap this check has to avoid, and a spurious
    // second resync would show up as the spectator overshooting here.
    await clickCell(white, whiteId, 12, 7);
    await expect.poll(() => moveCount(C), { timeout: 15000 }).toBe(6);
    expect(await stoneAt(C, 12, 7)).toBe(2);

    expect(pageErrors, 'no uncaught page errors during the run').toEqual([]);

    await A.ctx.close();
    await B.ctx.close();
    await C.ctx.close();
  });
});
