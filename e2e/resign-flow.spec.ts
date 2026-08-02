import { test, expect, Page } from '@playwright/test';

/**
 * TEST-MATRIX.md row 8 — Resign via the in-game "Đầu hàng" button
 * (client/js/game-ui.js `doResign()` → `game:resign` → GameEngine.resign,
 * server/socket/handlers/GameHandler.js ~line 179). Distinct from the
 * force-resign path exercised by e2e/leave-then-create-room.spec.ts (which
 * never has an active game, so it never calls GameEngine.resign at all).
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

test.describe('Resign', () => {
  test('resigning ends the game in the opponent\'s favor on both clients', async ({ browser }) => {
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

    // PlayerA resigns regardless of color/turn — resign doesn't require it to
    // be your turn (GameEngine.resign only checks status === 'ongoing' and
    // that the resigner is one of the two players).
    A.page.on('dialog', (d) => d.accept());
    await expect(A.page.locator('.btn-game--resign')).toBeVisible({ timeout: 10000 });
    await A.page.click('.btn-game--resign');

    await A.page.waitForFunction(() => (window as any).RoomState?.gameState?.status === 'finished', null, { timeout: 10000 });
    await B.page.waitForFunction(() => (window as any).RoomState?.gameState?.status === 'finished', null, { timeout: 10000 });

    const result = await A.page.evaluate(() => (window as any).RoomState.gameState.result);
    const bUserId = await B.page.evaluate(() => (window as any).RoomState.myUser.userId);
    expect(result.reason).toBe('resign');
    expect(result.winner, 'PlayerB (the non-resigning player) should win').toBe(bUserId);

    await expect(A.page.locator('#game-overlay')).toHaveClass(/visible/, { timeout: 10000 });
    await expect(B.page.locator('#game-overlay')).toHaveClass(/visible/, { timeout: 10000 });
    await expect(A.page.locator('#overlay-result')).toContainText('thua');
    await expect(B.page.locator('#overlay-result')).toContainText('thắng');

    await A.ctx.close();
    await B.ctx.close();
  });
});
