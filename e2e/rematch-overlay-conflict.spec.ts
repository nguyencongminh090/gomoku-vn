import { test, expect, Page } from '@playwright/test';

/**
 * TODO.md #35 / instruction.md §B35 — Start Modal must never appear on top of
 * an unactioned #game-overlay (win/loss/draw + rematch/close). Root cause:
 * `game:rematch` (server/socket/handlers/GameHandler.js `game:rematch`) marks
 * the clicking player ready and, if the opponent hasn't matched yet, starts a
 * fresh ready-window (`syncReadyWindow`) whose `room:updated` broadcast reaches
 * BOTH clients — including whichever player hasn't yet clicked "Đấu lại" or
 * "Đóng" and still has their own #game-overlay open.
 *
 * Fix: (1) declining ("Đóng") now stands the player up (`room:stand`) instead
 * of leaving them seated-but-not-ready, so Start Modal's only real trigger is
 * "I am seated" — see client/js/room.js `btnCloseOverlay`. (2)
 * `renderStartModal()` (client/js/room-ui.js) additionally never shows while
 * the local client's own #game-overlay still has the `visible` class, as
 * defense-in-depth against any other path that could set `readyDeadline`
 * while a result overlay is unactioned.
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

test.describe('Rematch / close-overlay does not conflict with Start Modal', () => {
  test('opponent rematching while I still have the result overlay open must not pop Start Modal over it', async ({ browser }) => {
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

    // End the game quickly via resign — the specific end reason doesn't matter,
    // only that both clients reach the game-over overlay together.
    A.page.on('dialog', (d) => d.accept());
    await expect(A.page.locator('.btn-game--resign')).toBeVisible({ timeout: 10000 });
    await A.page.click('.btn-game--resign');

    await expect(A.page.locator('#game-overlay')).toHaveClass(/visible/, { timeout: 10000 });
    await expect(B.page.locator('#game-overlay')).toHaveClass(/visible/, { timeout: 10000 });

    // PlayerA rematches immediately. PlayerB deliberately has NOT clicked
    // anything yet — their #game-overlay is still open and unactioned.
    await A.page.click('#btn-rematch');
    await expect(A.page.locator('#game-overlay')).not.toHaveClass(/visible/);

    // Give the server round-trip (confirmStart → syncReadyWindow → room:updated)
    // time to reach PlayerB before asserting on their DOM state.
    await B.page.waitForFunction(
      () => (window as any).RoomState?.roomData?.readyDeadline != null,
      null,
      { timeout: 10000 },
    );

    // The bug: #start-modal would gain `.visible` right on top of PlayerB's
    // still-open #game-overlay. The fix keeps #game-overlay in sole control
    // until PlayerB actions it.
    await expect(B.page.locator('#game-overlay')).toHaveClass(/visible/);
    await expect(B.page.locator('#start-modal')).not.toHaveClass(/visible/);

    // PlayerB now declines the rematch — this must stand them up (not leave
    // them seated-but-not-ready), per the agreed design in instruction.md §B35.
    await B.page.click('#btn-close-overlay');
    await expect(B.page.locator('#game-overlay')).not.toHaveClass(/visible/);
    await B.page.waitForFunction(() => (window as any).RoomState?.mySlot === null, null, { timeout: 10000 });

    // With PlayerB no longer seated, the room isn't "both seated" — no ready
    // window should be running for PlayerA either.
    await expect(A.page.locator('#start-modal')).not.toHaveClass(/visible/);

    await A.ctx.close();
    await B.ctx.close();
  });

  test('Start Modal still appears normally once both seats are freshly filled (regression guard)', async ({ browser }) => {
    test.setTimeout(30_000);

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
    await expect(B.page.locator('#start-modal')).toHaveClass(/visible/, { timeout: 15000 });

    await A.ctx.close();
    await B.ctx.close();
  });
});
