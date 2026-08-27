import { test, expect, Page } from '@playwright/test';

/**
 * TODO.md #128 — Undo request/accept/decline (GameEngine.requestUndo/
 * acceptUndo/declineUndo, server/managers/GameEngine.js; game:undo_request/
 * game:undo_accept/game:undo_decline, server/socket/handlers/GameHandler.js).
 * Mirrors e2e/draw-offer.spec.ts's structure.
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

async function startGame(browser: any, opts: { swap2?: boolean } = {}) {
  const A = await makeGuest(browser, 'PlayerA');
  await A.page.goto('/index.html');
  await A.page.click('#btn-create');
  await A.page.click('#modal-advanced-toggle');
  await A.page.locator('#rule-wall').evaluate((el: HTMLInputElement) => {
    if (el.checked) { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  if (opts.swap2) {
    // #or-swap2 is a visually-hidden radio in a .pill-group — the <label>
    // is the actual clickable surface.
    await A.page.click('label[for="or-swap2"]');
  }
  await A.page.click('#btn-quick-match');
  await A.page.waitForURL(/room\.html/, { timeout: 15000 });
  // room.html is reached first (session intent stored, server assigns the
  // room after arrival); the `?id=` param is only attached later, via
  // history.replaceState once room:joined arrives. Wait for that instead of
  // racing it, since it can lag noticeably on a cold/first-request server.
  await A.page.waitForFunction(
    () => !!new URL(window.location.href).searchParams.get('id'),
    null,
    { timeout: 15000 },
  );
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

test.describe('Undo', () => {
  test.describe.configure({ mode: 'serial' });

  test('request -> accept rolls back 1 move when opponent has not replied yet', async ({ browser }) => {
    test.setTimeout(60_000);
    const { A, B } = await startGame(browser);

    // BLACK moves first — find who's BLACK and have them move once.
    const blackIsA = await A.page.evaluate(() => {
      const st = (window as any).RoomState;
      const me = st.gameState.players.find((p: any) => p.userId === st.myUser.userId);
      return me.color === 'BLACK';
    });
    const blackPage = blackIsA ? A.page : B.page;
    const whitePage = blackIsA ? B.page : A.page;

    await clickCell(blackPage, 5, 5);
    expect(await A.page.evaluate(() => (window as any).RoomState.gameState.moveCount)).toBe(1);

    await blackPage.click('.btn-game--undo');
    await expect(whitePage.locator('.btn-draw-accept')).toBeVisible({ timeout: 10000 });
    await expect(blackPage.locator('#undo-prompt-area')).toContainText('chờ đối thủ');

    await whitePage.click('.btn-draw-accept');
    await A.page.waitForFunction(() => (window as any).RoomState?.gameState?.moveCount === 0, null, { timeout: 10000 });
    await B.page.waitForFunction(() => (window as any).RoomState?.gameState?.moveCount === 0, null, { timeout: 10000 });

    const [boardA, turnA] = await A.page.evaluate(() => [
      (window as any).RoomState.gameState.board.flat().every((c: number) => c === 0),
      (window as any).RoomState.gameState.currentTurn,
    ]);
    expect(boardA, 'board must be fully cleared').toBe(true);
    const blackUserId = await blackPage.evaluate(() => (window as any).RoomState.myUser.userId);
    expect(turnA).toBe(blackUserId);

    await A.ctx.close();
    await B.ctx.close();
  });

  test('request -> accept rolls back 2 moves (full round) once opponent has replied', async ({ browser }) => {
    test.setTimeout(60_000);
    const { A, B } = await startGame(browser);

    const blackIsA = await A.page.evaluate(() => {
      const st = (window as any).RoomState;
      const me = st.gameState.players.find((p: any) => p.userId === st.myUser.userId);
      return me.color === 'BLACK';
    });
    const blackPage = blackIsA ? A.page : B.page;
    const whitePage = blackIsA ? B.page : A.page;

    await clickCell(blackPage, 5, 5);
    await clickCell(whitePage, 6, 6);
    expect(await A.page.evaluate(() => (window as any).RoomState.gameState.moveCount)).toBe(2);

    await blackPage.click('.btn-game--undo');
    await expect(whitePage.locator('.btn-draw-accept')).toBeVisible({ timeout: 10000 });
    await whitePage.click('.btn-draw-accept');

    await A.page.waitForFunction(() => (window as any).RoomState?.gameState?.moveCount === 0, null, { timeout: 10000 });
    const boardA = await A.page.evaluate(() =>
      (window as any).RoomState.gameState.board.flat().every((c: number) => c === 0));
    expect(boardA, 'both moves must be cleared').toBe(true);

    await A.ctx.close();
    await B.ctx.close();
  });

  test('request -> decline leaves the board and turn unchanged', async ({ browser }) => {
    test.setTimeout(60_000);
    const { A, B } = await startGame(browser);

    const blackIsA = await A.page.evaluate(() => {
      const st = (window as any).RoomState;
      const me = st.gameState.players.find((p: any) => p.userId === st.myUser.userId);
      return me.color === 'BLACK';
    });
    const blackPage = blackIsA ? A.page : B.page;
    const whitePage = blackIsA ? B.page : A.page;

    await clickCell(blackPage, 5, 5);
    await blackPage.click('.btn-game--undo');
    await expect(whitePage.locator('.btn-draw-decline')).toBeVisible({ timeout: 10000 });
    await whitePage.click('.btn-draw-decline');

    await expect(A.page.locator('#undo-prompt-area')).toBeEmpty({ timeout: 10000 });
    await expect(B.page.locator('#undo-prompt-area')).toBeEmpty({ timeout: 10000 });
    const moveCount = await A.page.evaluate(() => (window as any).RoomState.gameState.moveCount);
    expect(moveCount, 'declined undo must not change the board').toBe(1);

    await A.ctx.close();
    await B.ctx.close();
  });

  test('opponent replying while a request is pending does not cancel it, and accept still rolls back correctly', async ({ browser }) => {
    test.setTimeout(60_000);
    const { A, B } = await startGame(browser);

    const blackIsA = await A.page.evaluate(() => {
      const st = (window as any).RoomState;
      const me = st.gameState.players.find((p: any) => p.userId === st.myUser.userId);
      return me.color === 'BLACK';
    });
    const blackPage = blackIsA ? A.page : B.page;
    const whitePage = blackIsA ? B.page : A.page;

    await clickCell(blackPage, 5, 5);       // BLACK's move — targetIndex snapshot here
    await blackPage.click('.btn-game--undo'); // requested while WHITE hasn't replied
    await expect(whitePage.locator('#undo-prompt-area')).not.toBeEmpty({ timeout: 10000 });

    await clickCell(whitePage, 6, 6);       // WHITE replies instead of responding first
    // Pending request must survive the opponent's move.
    await expect(whitePage.locator('.btn-draw-accept')).toBeVisible({ timeout: 10000 });

    await whitePage.click('.btn-draw-accept');
    await A.page.waitForFunction(() => (window as any).RoomState?.gameState?.moveCount === 0, null, { timeout: 10000 });
    const boardA = await A.page.evaluate(() =>
      (window as any).RoomState.gameState.board.flat().every((c: number) => c === 0));
    expect(boardA, 'both the original move and the reply must be cleared').toBe(true);

    await A.ctx.close();
    await B.ctx.close();
  });

  test("requester's own next move auto-cancels their pending request", async ({ browser }) => {
    test.setTimeout(60_000);
    const { A, B } = await startGame(browser);

    const blackIsA = await A.page.evaluate(() => {
      const st = (window as any).RoomState;
      const me = st.gameState.players.find((p: any) => p.userId === st.myUser.userId);
      return me.color === 'BLACK';
    });
    const blackPage = blackIsA ? A.page : B.page;
    const whitePage = blackIsA ? B.page : A.page;

    await clickCell(blackPage, 5, 5);
    await clickCell(whitePage, 6, 6);
    await blackPage.click('.btn-game--undo'); // BLACK's turn again — requests instead of waiting
    await expect(whitePage.locator('#undo-prompt-area')).not.toBeEmpty({ timeout: 10000 });

    await clickCell(blackPage, 7, 7); // BLACK continues instead of waiting for a response

    await expect(A.page.locator('#undo-prompt-area')).toBeEmpty({ timeout: 10000 });
    await expect(B.page.locator('#undo-prompt-area')).toBeEmpty({ timeout: 10000 });
    const moveCount = await A.page.evaluate(() => (window as any).RoomState.gameState.moveCount);
    expect(moveCount, 'nothing should have been rolled back').toBe(3);

    await A.ctx.close();
    await B.ctx.close();
  });

  test('Swap2 opening: either player may request undo, removing exactly 1 stone', async ({ browser }) => {
    test.setTimeout(60_000);
    const { A, B } = await startGame(browser, { swap2: true });

    // First placeholder player (firstPlayerId) places the opening's 1st stone.
    const isFirst = await A.page.evaluate(() =>
      (window as any).RoomState.gameState.currentTurn === (window as any).RoomState.myUser.userId);
    const firstPage = isFirst ? A.page : B.page;
    const secondPage = isFirst ? B.page : A.page;

    await firstPage.waitForFunction(() => !!(window as any).RoomState?.boardRenderer?.geo?.cellSize, null, { timeout: 10000 });
    const before = await firstPage.evaluate(() => (window as any).RoomState.gameState.moveCount);
    const geo = await firstPage.evaluate(() => {
      const br = (window as any).RoomState.boardRenderer;
      return { cellSize: br.geo.cellSize, originX: br.geo.originX, originY: br.geo.originY };
    });
    const px = geo.originX + 5.5 * geo.cellSize;
    const py = geo.originY + 5.5 * geo.cellSize;
    await firstPage.locator('#game-canvas').click({ position: { x: px, y: py } });
    await firstPage.waitForFunction((bc) => (window as any).RoomState?.gameState?.moveCount > bc, before, { timeout: 10000 });

    // The non-placing second player requests undo of that single stone.
    await secondPage.click('.btn-game--undo');
    await expect(firstPage.locator('.btn-draw-accept')).toBeVisible({ timeout: 10000 });
    await firstPage.click('.btn-draw-accept');

    await A.page.waitForFunction(() => (window as any).RoomState?.gameState?.moveCount === 0, null, { timeout: 10000 });
    const phase = await A.page.evaluate(() => (window as any).RoomState.gameState.swap2.openingPhase);
    expect(phase).toBe('place3');

    await A.ctx.close();
    await B.ctx.close();
  });
});
