import { test, expect, Page, Browser, devices } from '@playwright/test';

/**
 * TODO.md #143 — the `✕` stand button (own seat only, `.slot-card__stand`)
 * shared `.slot-card__header`'s row with `.slot-card__name` via
 * `justify-content: space-between`, and at the old 32px min-width/min-height
 * + 6px gap it squeezed the own seat's name down to ~3 visible characters
 * while the opponent seat (no button) kept the row's full width.
 *
 * First fix attempt pulled the button out of the row entirely
 * (`position: absolute`, card's top-right corner) for full width parity
 * between seats. The user tried it live and asked to go back to the inline
 * look — the corner placement read as visually disjointed — accepting that
 * full parity goes away, but asked to shrink the button so the name keeps
 * *some* of the width back.
 *
 * `min-width`/`min-height` dropped from 32px to 24px — the WCAG 2.2 AA
 * "target size (minimum)" floor, not an arbitrary number, so this must not
 * go lower. This guard checks:
 *   1. the button still measures the intended 24px (not the old 32px, not
 *      shrunk past the accessibility floor by a future edit),
 *   2. it never visually overlaps the name box,
 *   3. it's still reliably tappable at that size with a REAL touch tap
 *      (Playwright touch-emulated mobile device, not a desktop click) —
 *      the whole point of flagging 24px as the floor is that touch,
 *      specifically, is what breaks first if a button gets too small.
 */

const NAME_A = 'Nguyễn Thị Ánh Tuyết Vy'; // 23 chars, own seat (has ✕)
const NAME_B = 'Trần Hoàng Minh Khôi Ng'; // 23 chars, opponent seat (no ✕)

async function register(browser: Browser, contextOptions: Parameters<Browser['newContext']>[0], username: string, displayName: string) {
  const ctx = await browser.newContext(contextOptions);
  const page: Page = await ctx.newPage();
  await page.goto('/login.html');
  await page.click('#tab-register');
  await page.fill('#reg-username', username);
  await page.fill('#reg-display', displayName);
  await page.fill('#reg-password', 'test-password-123');
  await page.fill('#reg-confirm', 'test-password-123');
  await page.click('#btn-register');
  await page.waitForURL(/index\.html|\/$/, { timeout: 20000 });
  return { ctx, page };
}

async function seatBothPlayers(browser: Browser, contextOptions: Parameters<Browser['newContext']>[0], stamp: string) {
  const A = await register(browser, contextOptions, `s143a${stamp}`, NAME_A);
  await A.page.click('#btn-create');
  if (await A.page.locator('#modal-advanced-toggle').isVisible().catch(() => false)) {
    await A.page.click('#modal-advanced-toggle');
  }
  const quick = A.page.locator('#btn-quick-match');
  if (await quick.isVisible().catch(() => false)) await quick.click();
  else await A.page.click('#modal-confirm');
  await A.page.waitForURL(/room\.html\?id=/, { timeout: 20000 });
  const roomUrl = A.page.url();

  await A.page.locator('#slot-1 .slot-card__clickable').click();
  await expect(A.page.locator('#slot-1 .slot-card__name')).toHaveText(NAME_A, { timeout: 15000 });

  const B = await register(browser, contextOptions, `s143b${stamp}`, NAME_B);
  await B.page.goto(roomUrl);
  await expect(B.page.locator('#room-id-nav')).not.toHaveText('', { timeout: 20000 });
  await B.page.locator('#slot-2 .slot-card__clickable').click();
  await expect(A.page.locator('#slot-2 .slot-card__name')).toHaveText(NAME_B, { timeout: 15000 });

  return { A, B, roomUrl };
}

test.describe('slot-card stand button: inline but shrunk to the touch-target floor (TODO.md #143)', () => {
  test('own-seat ✕ measures the 24px floor and never overlaps the name', async ({ browser }) => {
    test.setTimeout(60_000);
    const stamp = Date.now().toString().slice(-6);
    const { A, B } = await seatBothPlayers(browser, { viewport: { width: 1920, height: 995 } }, stamp);

    const g = await A.page.evaluate(() => {
      const card = document.querySelector('#slot-1')!;
      const name = card.querySelector('.slot-card__name')!.getBoundingClientRect();
      const stand = card.querySelector('.slot-card__stand')!.getBoundingClientRect();
      return {
        standWidth: +(stand.right - stand.left).toFixed(1),
        standHeight: +(stand.bottom - stand.top).toFixed(1),
        overlap: !(name.right <= stand.left || name.left >= stand.right || name.bottom <= stand.top || name.top >= stand.bottom),
      };
    });

    // Exactly the WCAG 2.2 AA floor — not the old 32px, and not shrunk
    // further than the floor by some future "just a bit smaller" edit.
    expect(g.standWidth, 'stand button width must be the 24px accessibility floor').toBeGreaterThanOrEqual(24);
    expect(g.standWidth, 'stand button width must not have crept back toward the old 32px').toBeLessThan(32);
    expect(g.standHeight).toBeGreaterThanOrEqual(24);
    expect(g.overlap, 'stand button must never visually overlap the name box').toBe(false);

    await A.ctx.close();
    await B.ctx.close();
  });

  test('real touch tap on the shrunk button still stands the player up', async ({ browser }) => {
    test.setTimeout(60_000);
    const stamp = 'touch' + Date.now().toString().slice(-6);
    const { A, B } = await seatBothPlayers(browser, { ...devices['Pixel 5'] }, stamp);

    const standBox = await A.page.locator('#slot-1 .slot-card__stand').boundingBox();
    expect(standBox, 'stand button must be present and have a real hit box').not.toBeNull();
    expect(standBox!.width, 'stand button hit box width').toBeGreaterThanOrEqual(24);
    expect(standBox!.height, 'stand button hit box height').toBeGreaterThanOrEqual(24);

    await A.page.locator('#slot-1 .slot-card__stand').tap();

    await expect(A.page.locator('#slot-1 .slot-card__empty')).toBeVisible({ timeout: 5000 });
    await expect(A.page.locator('#slot-1 .slot-card__name')).toHaveCount(0);

    await A.ctx.close();
    await B.ctx.close();
  });
});
