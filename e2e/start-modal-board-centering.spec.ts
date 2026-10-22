import { test, expect, Page, Browser } from './helpers/fixtures';
import { authAsGuest } from './helpers/auth';
import { createRoom, joinRoom, sit } from './helpers/room';

/**
 * TODO.md #137 — `#start-modal` is anchored to `.board-area-shell`
 * (`position:absolute; inset:0`, game.css) so its card centres on the BOARD and
 * the overlay never covers the other room chrome (the stand-up buttons and
 * chat must stay usable while it shows, TODO.md #36). In the zen skin the shell
 * spanned the whole viewport, so the overlay stretched across the drawer.
 *
 * Arena Focus (#216) replaced the drawer/bottom sheet with a `.rail` column
 * (desktop) and a one-column stack (<=768px: opponent card, board, my card,
 * tiles, panel). The invariant carries over unchanged in two shapes:
 *   - desktop: overlay stays inside the board column — zero overlap with `.rail`;
 *   - phone:   overlay spans the board only — zero overlap with either player
 *     card, and it keeps the full viewport width. Checked with the chat panel
 *     minimized AND expanded (the expanded state un-pins the sticky stack).
 * In both, the card is centred on the board.
 */

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 393, height: 727 };

async function guest(browser: Browser, viewport: { width: number; height: number }) {
  const ctx = await browser.newContext({ viewport, hasTouch: viewport.width < 700, isMobile: viewport.width < 700 });
  const page: Page = await ctx.newPage();
  await authAsGuest(ctx, page);
  return { ctx, page };
}

/** Two seated guests in a fresh room ⇒ `#start-modal` is showing on A's page. */
async function roomWithStartModal(browser: Browser, viewport: { width: number; height: number }) {
  const A = await guest(browser, viewport);
  const roomUrl = await createRoom(A.page, { wall: false });
  const B = await guest(browser, viewport);
  await joinRoom(B.page, roomUrl);
  await sit(A.page, 1);
  await sit(B.page, 2);
  await expect(A.page.locator('#start-modal')).toHaveClass(/visible/, { timeout: 20000 });
  return { A, B };
}

async function geometry(page: Page) {
  return await page.evaluate(() => {
    const box = (sel: string) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, cx: b.left + b.width / 2 };
    };
    const overlap = (a: any, b: any) => ({
      x: Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)),
      y: Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)),
    });
    const overlay = box('#start-modal')!;
    const rail = box('.rail')!;
    const top = box('#seatcard-top')!;
    const bottom = box('#seatcard-bottom')!;
    return {
      overlay,
      card: box('.start-modal__card')!,
      canvas: box('#game-canvas')!,
      rail: overlap(overlay, rail),
      top: overlap(overlay, top),
      bottom: overlap(overlay, bottom),
      railLeft: rail.left,
    };
  });
}

test.describe('Start Modal overlay stays over the board, not over the other room chrome', () => {
  test('desktop: card centres on the board and the overlay clears the rail', async ({ browser }) => {
    test.setTimeout(60_000);
    const { A, B } = await roomWithStartModal(browser, DESKTOP);

    const g = await geometry(A.page);
    expect(Math.abs(g.card.cx - g.canvas.cx)).toBeLessThanOrEqual(2);
    expect(g.rail.x, 'overlay must not reach into the rail column').toBe(0);
    expect(g.overlay.right).toBeLessThanOrEqual(g.railLeft + 1);

    await A.ctx.close();
    await B.ctx.close();
  });

  for (const expanded of [false, true]) {
    test(`phone, chat panel ${expanded ? 'expanded' : 'minimized'}: overlay is full-width and clears both player cards`, async ({ browser }) => {
      test.setTimeout(60_000);
      const { A, B } = await roomWithStartModal(browser, MOBILE);
      if (expanded) {
        await A.page.click('#rpanel-toggle');
        await expect(A.page.locator('#rpanel-toggle')).toHaveAttribute('aria-expanded', 'true');
        await A.page.waitForTimeout(500); // 240ms height animation
        // Expanded un-pins the stack; the board may have scrolled — bring it back.
        await A.page.locator('#start-modal').scrollIntoViewIfNeeded();
      }

      const g = await geometry(A.page);
      expect(g.overlay.left).toBe(0);
      expect(g.overlay.right).toBe(MOBILE.width);
      expect(Math.abs(g.card.cx - g.canvas.cx)).toBeLessThanOrEqual(2);
      expect(g.top.y, 'overlay must not cover the opponent card').toBe(0);
      expect(g.bottom.y, 'overlay must not cover my card (its ✕ must stay tappable)').toBe(0);

      await A.ctx.close();
      await B.ctx.close();
    });
  }
});
