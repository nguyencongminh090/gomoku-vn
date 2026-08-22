import { test, expect, Page, Browser } from '@playwright/test';

/**
 * TODO.md #143 — `.slot-card__header` laid the `✕` stand button (own seat
 * only, `.slot-card__stand`, min-width/height 32px + 6px flex gap) inline
 * with `.slot-card__name` via `justify-content: space-between`. In a ~117px
 * seat card that left the name only ~70px, while the other seat (no button)
 * kept the row's full width — own name read shorter than the opponent's,
 * backwards from what a player would expect.
 *
 * Not a regression from #142: that fix (pinning the grid track at
 * `minmax(0, 1fr)`) made names ellipsise instead of blowing out the drawer —
 * it's what made this pre-existing asymmetry visible instead of hidden by a
 * broken layout.
 *
 * Fix: the stand button is pulled out of the name row via
 * `position: absolute` into the card's top-right corner (empty space next to
 * the short "#1"/"#2" label), so both seats' name rows get equal width.
 * `.slot-card__header` gets a uniform `padding-top` (applied to both seats,
 * whether or not that seat has the button) so the name still clears the
 * button vertically without the two seats' names starting at different
 * heights.
 *
 * Guard: with equal-length long real names (>20 chars, past the server's
 * `isValidDisplayName` floor) seated in both slots, the seat WITH the button
 * must offer the same available name width as the seat WITHOUT it, and the
 * button must not visually overlap the name box.
 */

const VIEWPORTS = [
  { width: 1920, height: 995 },
  { width: 1280, height: 900 },
];

// 23 chars each — long enough to guarantee ellipsis-truncation in a ~117px
// card at both viewports, same fixture shape as e2e/drawer-rail-not-displaced.
const NAME_A = 'Nguyễn Thị Ánh Tuyết Vy';
const NAME_B = 'Trần Hoàng Minh Khôi Ng';

async function register(browser: Browser, viewport: { width: number; height: number }, username: string, displayName: string) {
  const ctx = await browser.newContext({ viewport });
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

async function seatGeometry(page: Page) {
  return await page.evaluate(() => {
    function info(cardSel: string) {
      const card = document.querySelector(cardSel)!;
      const name = card.querySelector('.slot-card__name')!;
      const stand = card.querySelector('.slot-card__stand');
      const nameRect = name.getBoundingClientRect();
      const standRect = stand ? stand.getBoundingClientRect() : null;
      const overlap = !!standRect && !(
        nameRect.right <= standRect.left ||
        nameRect.left >= standRect.right ||
        nameRect.bottom <= standRect.top ||
        nameRect.top >= standRect.bottom
      );
      return {
        hasStand: !!stand,
        nameClientWidth: (name as HTMLElement).clientWidth,
        nameTop: +nameRect.top.toFixed(1),
        overlap,
      };
    }
    return { slot1: info('#slot-1'), slot2: info('#slot-2') };
  });
}

test.describe('slot-card own-seat name is not squeezed by the stand button (TODO.md #143)', () => {
  for (const viewport of VIEWPORTS) {
    test(`own seat (with ✕) and opponent seat (without) offer equal name width at ${viewport.width}px`, async ({ browser }) => {
      test.setTimeout(60_000);
      const stamp = `${viewport.width}${Date.now().toString().slice(-6)}`;

      const A = await register(browser, viewport, `s143a${stamp}`, NAME_A);
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

      const B = await register(browser, viewport, `s143b${stamp}`, NAME_B);
      await B.page.goto(roomUrl);
      await expect(B.page.locator('#room-id-nav')).not.toHaveText('', { timeout: 20000 });
      await B.page.locator('#slot-2 .slot-card__clickable').click();
      await expect(A.page.locator('#slot-2 .slot-card__name')).toHaveText(NAME_B, { timeout: 15000 });

      const g = await seatGeometry(A.page);

      // Slot 1 is A's own seat (state !== 'playing', so the stand button renders).
      expect(g.slot1.hasStand, 'own seat must show the stand button').toBe(true);
      expect(g.slot2.hasStand, 'opponent seat must not show a stand button').toBe(false);

      expect(g.slot1.overlap, 'stand button must not overlap the own-seat name box').toBe(false);

      // The whole point of the fix: both seats get the same available width
      // for the name, regardless of which one carries the stand button.
      expect(
        Math.abs(g.slot1.nameClientWidth - g.slot2.nameClientWidth),
        `own-seat name width (${g.slot1.nameClientWidth}px) must match opponent-seat name width (${g.slot2.nameClientWidth}px)`
      ).toBeLessThanOrEqual(2);

      // Both name rows must start at the same height (header padding is
      // uniform across both seats), so the two cards stay visually aligned.
      expect(
        Math.abs(g.slot1.nameTop - g.slot2.nameTop),
        'both seats\' name rows must start at the same height'
      ).toBeLessThanOrEqual(1);

      await A.ctx.close();
      await B.ctx.close();
    });
  }
});
