import { test, expect, Page, Browser, devices } from '@playwright/test';

/**
 * TODO.md #144 — `.topnav` was a fixed 60px on zen mobile (`--zen-topnav-h`),
 * always showing the full brand/logo + room code + leave button row. On an
 * iPhone SE that's 9% of the viewport, the largest remaining chrome cost on
 * the room screen, for a bar whose brand/logo half is purely decorative
 * during a match.
 *
 * Two rounds of user feedback shaped the final design (see
 * docs/todo/B144-*.md for the full history):
 *   1. First measured whether hiding it actually grows the board — it
 *      doesn't (board is width-bound on every phone viewport tested, so the
 *      freed height becomes blank space below .game-controls, not board).
 *      Kept anyway as a pure decluttering change.
 *   2. First implementation used a ▾ toggle to expand/collapse the full row.
 *      User reviewed it live and asked for something simpler: no toggle at
 *      all, just a permanently minimal bar — leave icon (left), room code
 *      (center), the global settings gear (right, injected at runtime by
 *      settings-panel.js). Brand/logo drops for good on mobile.
 *
 * This guards the FINAL shape: minimal height at all times (no expand
 * state), and the two controls that exist ONLY in this nav — leave and room
 * code — plus the settings gear stay visible and functional.
 */

const VIEWPORTS = [
  { name: 'Pixel 5', opts: { ...devices['Pixel 5'] } },
  { name: 'iPhone SE 375x667', opts: { viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } },
];

async function register(browser: Browser, contextOptions: any, username: string, displayName: string) {
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

test.describe('room topnav is a minimal always-on bar on zen mobile (TODO.md #144)', () => {
  for (const { name, opts } of VIEWPORTS) {
    test(`${name}: topnav stays minimal-height with leave/room-code/settings reachable`, async ({ browser }) => {
      test.setTimeout(60_000);
      const stamp = Date.now().toString().slice(-6);

      const A = await register(browser, opts, `s144a${stamp}`, 'Nguoi Choi A');
      await A.page.click('#btn-create');
      if (await A.page.locator('#modal-advanced-toggle').isVisible().catch(() => false)) {
        await A.page.click('#modal-advanced-toggle');
      }
      const quick = A.page.locator('#btn-quick-match');
      if (await quick.isVisible().catch(() => false)) await quick.click();
      else await A.page.click('#modal-confirm');
      await A.page.waitForURL(/room\.html\?id=/, { timeout: 20000 });

      // The whole point of the fix: the nav row is small, not the old 60px.
      const topnavHeight = await A.page.locator('.topnav').evaluate(
        (el) => el.getBoundingClientRect().height
      );
      expect(topnavHeight, 'topnav must be the collapsed minimal height, not the old 60px').toBeLessThanOrEqual(36);

      // Leave, room code, and settings all present and visible.
      const leave = A.page.locator('#btn-leave');
      const roomId = A.page.locator('#room-id-nav');
      const settings = A.page.locator('#btn-settings');
      await expect(leave, 'leave button is the only exit from a room — must always be visible').toBeVisible();
      await expect(roomId, 'room code must always be visible (needed to invite others)').toBeVisible();
      await expect(settings, 'global settings gear must remain reachable').toBeVisible();

      // Nothing clipped out of the shrunk row — every control's box must sit
      // fully inside the nav's own bounding box.
      const navBox = await A.page.locator('.topnav').boundingBox();
      for (const loc of [leave, roomId, settings]) {
        const box = await loc.boundingBox();
        expect(box, 'control must have a real box').not.toBeNull();
        expect(box!.y, 'control must not start above the nav').toBeGreaterThanOrEqual(navBox!.y - 1);
        expect(box!.y + box!.height, 'control must not overflow below the nav').toBeLessThanOrEqual(navBox!.y + navBox!.height + 1);
      }

      // Functional, not just visible: leaving actually leaves the room.
      // No confirm() dialog fires pre-game (mySlot is null at this point).
      await leave.click();
      await A.page.waitForURL(/index\.html|\/$/, { timeout: 10000 });

      await A.ctx.close();
    });
  }
});
