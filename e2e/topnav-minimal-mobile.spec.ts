import { test, expect, devices } from './helpers/fixtures';
import { authAsGuest } from './helpers/auth';
import { createRoom } from './helpers/room';

/**
 * TODO.md #144 — on phones the room's `.topnav` must stay a small always-on bar
 * (it was a fixed 60px, brand row and all): leave icon, room code, nothing the
 * match doesn't need. Arena Focus (#216/#218) keeps that intent with a new
 * budget — `--nav-h: 48px` on <=768px, the sticky bar the whole page layout is
 * computed from (`.room` is `100dvh - --nav-h`). The settings gear is gone
 * from the room nav (Settings is a tab in the panel), so this guards the two
 * controls that exist ONLY here — leave and room code — plus the height:
 *   - bar height <= 48px and equal to --nav-h (the layout math depends on it),
 *   - leave + room code visible and fully inside the bar,
 *   - leave works.
 */

const VIEWPORTS = [
  { name: 'Pixel 5', opts: { ...devices['Pixel 5'] } },
  { name: 'iPhone SE 375x667', opts: { viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
];

test.describe('room topnav is a minimal always-on bar on phones (TODO.md #144)', () => {
  for (const { name, opts } of VIEWPORTS) {
    // TODO.md #184: oversized .topnav__btn padding once overflowed the bar — the box checks below catch that.
    test(`${name}: topnav stays minimal-height with leave and room code reachable`, async ({ browser }) => {
      test.setTimeout(60_000);
      const ctx = await browser.newContext(opts);
      const page = await ctx.newPage();
      await authAsGuest(ctx, page);
      await createRoom(page);

      // The whole point: the nav row is small, and it is the layout's --nav-h.
      const { topnavHeight, navVar } = await page.evaluate(() => ({
        topnavHeight: document.querySelector('.topnav')!.getBoundingClientRect().height,
        navVar: parseFloat(getComputedStyle(document.body).getPropertyValue('--nav-h')),
      }));
      expect(topnavHeight, 'topnav must stay the minimal bar, not the old 60px').toBeLessThanOrEqual(48);
      expect(topnavHeight, 'topnav height must equal the --nav-h the room layout subtracts').toBe(navVar);

      // Leave and room code present and visible.
      const leave = page.locator('#btn-leave');
      const roomId = page.locator('#room-id-nav');
      await expect(leave, 'leave button is the only exit from a room — must always be visible').toBeVisible();
      await expect(roomId, 'room code must always be visible (needed to invite others)').toBeVisible();

      // Nothing clipped out of the shrunk row — every control's box must sit
      // fully inside the nav's own bounding box.
      const navBox = await page.locator('.topnav').boundingBox();
      for (const loc of [leave, roomId]) {
        const box = await loc.boundingBox();
        expect(box, 'control must have a real box').not.toBeNull();
        expect(box!.y, 'control must not start above the nav').toBeGreaterThanOrEqual(navBox!.y - 1);
        expect(box!.y + box!.height, 'control must not overflow below the nav').toBeLessThanOrEqual(navBox!.y + navBox!.height + 1);
      }

      // Functional, not just visible: leaving actually leaves the room.
      // No confirm() dialog fires pre-game (mySlot is null at this point).
      await leave.click();
      await page.waitForURL(/index\.html|\/$/, { timeout: 10000 });

      await ctx.close();
    });
  }
});
