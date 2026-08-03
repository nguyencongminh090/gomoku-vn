import { test, expect, Page } from '@playwright/test';

/**
 * TEST-MATRIX.md rows 9-11 — Draw offer/accept/decline and the
 * auto-clear-on-move behavior (GameEngine.offerDraw/acceptDraw/declineDraw,
 * server/managers/GameEngine.js ~line 418-464; makeMove clears a pending
 * offer at ~line 198).
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

async function startGame(browser: any) {
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
  return { A, B };
}

async function clickCell(page: Page, x: number, y: number) {
  await page.waitForFunction(() => !!(window as any).RoomState?.boardRenderer?.geo?.cellSize, null, { timeout: 10000 });
  const geo = await page.evaluate(() => {
    const br = (window as any).RoomState.boardRenderer;
    return { cellSize: br.geo.cellSize, originX: br.geo.originX, originY: br.geo.originY };
  });
  const px = geo.originX + (x + 0.5) * geo.cellSize;
  const py = geo.originY + (y + 0.5) * geo.cellSize;
  const before = await page.evaluate(() => (window as any).RoomState.gameState.moveCount);
  await page.locator('#game-canvas').click({ position: { x: px, y: py } });
  await page.waitForFunction((bc) => (window as any).RoomState?.gameState?.moveCount > bc, before, { timeout: 10000 });
}

test.describe('Draw offer', () => {
  // Each test creates its own room; running them in parallel workers can pile
  // enough concurrently-live rooms from this one IP to trip MAX_ROOMS_PER_IP
  // (=3, server/config.js) — see TODO.md #18. Serial keeps this file
  // deterministic regardless of the runner's default worker count.
  test.describe.configure({ mode: 'serial' });

  test('offer -> accept ends the game as a draw for both players', async ({ browser }) => {
    test.setTimeout(60_000);
    const { A, B } = await startGame(browser);

    await A.page.click('.btn-game--draw');
    await expect(B.page.locator('.btn-draw-accept')).toBeVisible({ timeout: 10000 });
    await expect(A.page.locator('#draw-prompt-area')).toContainText('chờ đối thủ');

    await B.page.click('.btn-draw-accept');
    await A.page.waitForFunction(() => (window as any).RoomState?.gameState?.status === 'finished', null, { timeout: 10000 });
    const result = await A.page.evaluate(() => (window as any).RoomState.gameState.result);
    expect(result.winner).toBe('draw');
    expect(result.reason).toBe('agreement');

    // No more win/lose/draw modal (TODO.md #36 removed #game-overlay) — game
    // end resets both seats to not-ready ("new seat pair") and the Start
    // Modal reappears, ready for a fresh round, since nobody stood up.
    await expect(A.page.locator('#start-modal')).toHaveClass(/visible/, { timeout: 10000 });
    await expect(B.page.locator('#start-modal')).toHaveClass(/visible/, { timeout: 10000 });

    await A.ctx.close();
    await B.ctx.close();
  });

  test('offer -> decline clears the offer and the game continues', async ({ browser }) => {
    test.setTimeout(60_000);
    const { A, B } = await startGame(browser);

    await A.page.click('.btn-game--draw');
    await expect(B.page.locator('.btn-draw-decline')).toBeVisible({ timeout: 10000 });
    await B.page.click('.btn-draw-decline');

    await expect(A.page.locator('#draw-prompt-area')).toBeEmpty({ timeout: 10000 });
    await expect(B.page.locator('#draw-prompt-area')).toBeEmpty({ timeout: 10000 });
    const status = await A.page.evaluate(() => (window as any).RoomState.gameState.status);
    expect(status, 'game must still be ongoing after a declined draw').toBe('ongoing');

    await A.ctx.close();
    await B.ctx.close();
  });

  test('a pending draw offer is silently cancelled once a move is made', async ({ browser }) => {
    test.setTimeout(60_000);
    const { A, B } = await startGame(browser);

    const blackId = await A.page.evaluate(() => {
      const st = (window as any).RoomState;
      const me = st.gameState.players.find((p: any) => p.userId === st.myUser.userId);
      return me.color === 'BLACK' ? st.myUser.userId : null;
    });
    const blackPage = blackId ? A.page : B.page;
    const offerPage = A.page; // whoever offers, doesn't matter for this assertion

    await offerPage.click('.btn-game--draw');
    await expect(offerPage.locator('#draw-prompt-area')).not.toBeEmpty({ timeout: 10000 });

    // Whoever's turn it is (BLACK moves first) makes a move — the pending
    // offer must be cleared as a side effect (GameEngine.makeMove line ~198).
    await clickCell(blackPage, 5, 5);

    await expect(A.page.locator('#draw-prompt-area')).toBeEmpty({ timeout: 10000 });
    await expect(B.page.locator('#draw-prompt-area')).toBeEmpty({ timeout: 10000 });

    await A.ctx.close();
    await B.ctx.close();
  });
});
