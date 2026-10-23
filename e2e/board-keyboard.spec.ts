import { test, expect, Page, BrowserContext } from './helpers/fixtures';

/**
 * TODO.md #326 — the room board is playable with the keyboard alone.
 * Run against an isolated server (own port + GOMOKU_DB_PATH), see playwright-e2e-safety:
 *   PLAYWRIGHT_BASE_URL=http://localhost:3199 npx playwright test e2e/board-keyboard.spec.ts --project=chromium
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

/** Create + join a 2-player room through the real UI, Wall rule off, and start the game. */
async function setUpGame(browser: any, guestFactory: typeof makeGuest): Promise<[Player, Player]> {
  const A = await guestFactory(browser, 'PlayerA');
  await A.page.goto('/index.html#rooms');
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

  await A.page.locator('[data-slot="1"] .seatcard__sit').click();
  await B.page.locator('[data-slot="2"] .seatcard__sit').click();
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

test('Tab reaches the board; arrows + Enter place a stone seen by both clients (#326)', async ({ browser }) => {
  test.setTimeout(90_000);
  const [A, B] = await setUpGame(browser, makeGuest);
  const mover = await A.page.evaluate(() => (window as any).RoomState.boardRenderer.isMyTurn) ? A : B;
  const other = mover === A ? B : A;
  const svg = mover.page.locator('#board-area svg.gboard');
  await expect(svg).toHaveAttribute('role', 'application');
  await expect(svg).toHaveAttribute('tabindex', '0');
  // Reach the board by Tab only (walk forward until it holds focus).
  await mover.page.locator('body').click({ position: { x: 1, y: 1 } });
  let focused = false;
  for (let i = 0; i < 60 && !focused; i++) {
    await mover.page.keyboard.press('Tab');
    focused = await svg.evaluate((el) => el === document.activeElement);
  }
  expect(focused, 'board reachable with Tab').toBe(true);
  const n = await mover.page.evaluate(() => (window as any).RoomState.gameState.boardSize);
  const c = (n - 1) >> 1;
  await mover.page.keyboard.press('ArrowRight'); // lands on the centre
  await expect(svg.locator('.gboard__kbcursor')).toHaveCount(1);
  await mover.page.keyboard.press('Enter');
  for (const p of [mover, other]) {
    await p.page.waitForFunction(
      ([x, y]) => (window as any).RoomState.gameState.board[y][x] !== 0, [c, c], { timeout: 10000 });
  }
});
