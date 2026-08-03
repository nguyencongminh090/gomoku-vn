import { test, expect, Page } from '@playwright/test';

/**
 * TODO.md #36 / instruction.md §B36 — the whole point of shrinking Start
 * Modal (no more full-screen `.game-overlay` backdrop) is that it must NOT
 * block interaction with the rest of the page while it's showing. This is
 * the one Playwright test instruction.md explicitly calls out as mandatory
 * for the redesign: confirm the seat's stand-up button and chat both still
 * work while `#start-modal` has the `visible` class.
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

test.describe('Start Modal does not block the board/seats/chat underneath', () => {
  test('chat still works while Start Modal is visible', async ({ browser }) => {
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

    // Chat input/send are outside the modal card — must still be clickable
    // and functional while the modal is showing (no full-screen backdrop).
    await A.page.fill('#chat-input', 'hello while modal is up');
    await A.page.click('#btn-send');
    await expect(B.page.locator('#chat-messages')).toContainText('hello while modal is up', { timeout: 10000 });

    await A.ctx.close();
    await B.ctx.close();
  });

  test('standing up via the seat button works while Start Modal is visible', async ({ browser }) => {
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

    // The seat's own stand-up button (client/js/room-ui.js
    // `.slot-card__stand`) sits underneath/beside the modal card, outside its
    // backdrop-free hit area — it must still be clickable, not obscured by a
    // full-screen overlay the way the old #start-modal was.
    await A.page.locator('#slot-1 .slot-card__stand').click();
    await A.page.waitForFunction(() => (window as any).RoomState?.mySlot === null, null, { timeout: 10000 });
    expect(await A.page.evaluate(() => (window as any).RoomState.mySlot)).toBeNull();

    await A.ctx.close();
    await B.ctx.close();
  });
});
