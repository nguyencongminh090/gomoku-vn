import { test, expect, Page } from '@playwright/test';

/**
 * TODO.md #36 / instruction.md §B36 superseded #35's original fix here:
 * #game-overlay (the win/loss/draw + rematch/close modal) and the separate
 * `game:rematch` event are both gone. Game end now just resets both seats to
 * not-ready — the exact same "new seat pair" state a fresh sit-down produces
 * — and the normal Start Modal / room:ready flow runs again from scratch.
 * There is no longer a second modal for it to conflict with.
 *
 * This file used to guard the #35 fix (Start Modal must not pop up on top of
 * an unactioned #game-overlay). That scenario can't happen any more since
 * there's only one modal now, so the specific conflict test is gone. What's
 * still worth guarding: that "game end = new seat pair" doesn't silently
 * carry over a stale `ready` flag from the finished game — otherwise the next
 * round could auto-start the instant one player clicks Start, skipping the
 * other player's chance to confirm.
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

test.describe('Start Modal after game end (TODO.md #36 seat-pair reset)', () => {
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

  test('after a resign, the next round needs both players to click Start again — no stale ready carries over', async ({ browser }) => {
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

    A.page.on('dialog', (d) => d.accept());
    await expect(A.page.locator('.btn-game--resign')).toBeVisible({ timeout: 10000 });
    await A.page.click('.btn-game--resign');

    // Neither player stood up, so the room goes straight back to "both
    // seated" — Start Modal reappears without anyone acting on a result modal.
    await expect(A.page.locator('#start-modal')).toHaveClass(/visible/, { timeout: 10000 });
    await expect(B.page.locator('#start-modal')).toHaveClass(/visible/, { timeout: 10000 });

    // PlayerA (who resigned last round) clicks Start again for round 2.
    await A.page.click('#start-modal-btn');

    // If a stale `ready` flag had survived from round 1, PlayerB would already
    // read as ready and the game would start the instant A clicks — before B
    // does anything. It must NOT: B still needs to click, and the game must
    // stay in the idle/room state until they do.
    await B.page.waitForTimeout(500);
    const stateAfterOnlyAClicked = await B.page.evaluate(() => (window as any).RoomState.roomData.state);
    expect(stateAfterOnlyAClicked, 'round 2 must not auto-start from a stale ready flag').toBe('idle');

    await B.page.click('#start-modal-btn');
    await A.page.waitForFunction(() => (window as any).RoomState?.gameState?.status === 'ongoing', null, { timeout: 20000 });
    await B.page.waitForFunction(() => (window as any).RoomState?.gameState?.status === 'ongoing', null, { timeout: 20000 });

    await A.ctx.close();
    await B.ctx.close();
  });
});
