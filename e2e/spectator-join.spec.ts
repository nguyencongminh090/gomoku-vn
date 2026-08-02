import { test, expect, Page } from '@playwright/test';

/**
 * TEST-MATRIX.md row 15 — a user who joins a room without sitting (`room:sit`)
 * stays a spectator: server keeps them in `room.users` with `slot: null` /
 * `role: 'guest'` (server/managers/RoomManager.js joinRoom + serializeRoom),
 * and they show up in the "Khán giả" (spectators) tab
 * (client/js/room-ui.js renderUsersList / `#users-list`) rather than a seat.
 * This test confirms a spectator sees live chat and moves without ever
 * taking a seat themselves.
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

test.describe('Spectator join', () => {
  test('a user who joins without sitting stays a spectator and sees live chat/moves', async ({ browser }) => {
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

    // Spectator joins the room but never sits.
    const C = await makeGuest(browser, 'Spectator');
    await C.page.goto(`/room.html?id=${encodeURIComponent(roomId!)}`);
    await expect(C.page.locator('#room-id-nav')).not.toHaveText('', { timeout: 15000 });

    const cState = await C.page.evaluate(() => ({
      mySlot: (window as any).RoomState.mySlot,
      myRole: (window as any).RoomState.myRole,
    }));
    expect(cState.mySlot, 'a user who never called room:sit should have no seat').toBeNull();
    expect(cState.myRole, 'an unseated room member is role "guest"').toBe('guest');

    // Spectator shows up in the spectators tab, not in a slot.
    await C.page.click('.tab-btn[data-tab="tab-users"]');
    await expect(C.page.locator('#users-list')).toContainText(C.displayName, { timeout: 10000 });

    // A and B sit, ready up, and start a game — the spectator should observe
    // the game state flip to 'ongoing' without ever sitting.
    await A.page.locator('#slot-1 .slot-card__clickable').click();
    await B.page.locator('#slot-2 .slot-card__clickable').click();
    await expect(A.page.locator('#start-modal')).toHaveClass(/visible/, { timeout: 15000 });
    await A.page.click('#start-modal-btn');
    await B.page.click('#start-modal-btn');
    await A.page.waitForFunction(() => (window as any).RoomState?.gameState?.status === 'ongoing', null, { timeout: 20000 });
    await C.page.waitForFunction(() => (window as any).RoomState?.gameState?.status === 'ongoing', null, { timeout: 20000 });

    const cStillSpectator = await C.page.evaluate(() => (window as any).RoomState.mySlot);
    expect(cStillSpectator, 'spectator must remain unseated through the whole game start').toBeNull();

    // Chat sent by a player is visible live to the spectator.
    const chatText = `hello-from-A-${Date.now()}`;
    await A.page.fill('#chat-input', chatText);
    await A.page.click('#btn-send');
    await expect(C.page.locator('#chat-messages')).toContainText(chatText, { timeout: 10000 });

    // A move made by a player is visible live to the spectator's board state.
    await A.page.waitForFunction(() => !!(window as any).RoomState?.boardRenderer?.geo?.cellSize, null, { timeout: 10000 });
    const movesBefore = await C.page.evaluate(() => (window as any).RoomState.gameState.moveCount ?? 0);
    await A.page.waitForFunction(() => !!(window as any).RoomState?.gameState?.currentTurn, null, { timeout: 10000 });
    const currentTurn = await A.page.evaluate(() => (window as any).RoomState.gameState.currentTurn);
    const aUserId = await A.page.evaluate(() => (window as any).RoomState.myUser.userId);
    const mover = currentTurn === aUserId ? A.page : B.page;
    await mover.waitForFunction(() => !!(window as any).RoomState?.boardRenderer?.geo?.cellSize, null, { timeout: 10000 });
    const geo = await mover.evaluate(() => (window as any).RoomState.boardRenderer.geo);
    const { cellSize, originX, originY } = geo;
    const px = originX + 7.5 * cellSize;
    const py = originY + 7.5 * cellSize;
    await mover.mouse.move(px - 10, py - 10);
    await mover.locator('#game-canvas').hover({ position: { x: px, y: py } });
    // Default clickMode is 'double': first click previews the cell, a second
    // click on the same cell confirms placement (client/js/board.js _handleCellSelect).
    await mover.locator('#game-canvas').click({ position: { x: px, y: py } });
    await mover.locator('#game-canvas').click({ position: { x: px, y: py } });

    await mover.waitForFunction(
      (before) => ((window as any).RoomState.gameState.moveCount ?? 0) > before,
      movesBefore,
      { timeout: 10000 }
    );
    await C.page.waitForFunction(
      (before) => ((window as any).RoomState.gameState.moveCount ?? 0) > before,
      movesBefore,
      { timeout: 10000 }
    );

    await A.ctx.close();
    await B.ctx.close();
    await C.ctx.close();
  });
});
