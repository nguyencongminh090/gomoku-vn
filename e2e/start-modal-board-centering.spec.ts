import { test, expect, Page, Browser } from '@playwright/test';

/**
 * TODO.md #137 — `#start-modal` is anchored to `.board-area-shell`
 * (`position:absolute; inset:0`, game.css). In the zen skin that shell spans
 * the whole viewport and the drawer's space is only its `padding-right`, so
 * `inset:0` used to stretch the overlay across the drawer as well: the card
 * centred on the VIEWPORT instead of on the board (measured 170px off at
 * 1440px = half of --zen-drawer-w) and the overlay's z-index 50 sat above
 * `.panel-right-shell`'s 15.
 *
 * The fix makes the zen overlay honour the shell's own padding
 * (`room-zen.css`, `body.zen-room .start-modal`). This spec is the regression
 * guard for both halves, in all four combinations the fix has to hold in:
 * desktop/mobile × drawer open/collapsed.
 *
 * Mobile is deliberately asserted too, and asserted to be UNCHANGED: ≤768px
 * re-anchors the overlay to the free strip between the topnav and the bottom
 * sheet (TODO.md #139), and the desktop collapsed selector is one class more
 * specific than the mobile one — without the `inset` repeated in the mobile
 * collapsed rule, the desktop drawer-width inset leaks down to phones.
 */

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 393, height: 727 };

/** Real login-UI flow: session.js's requireAuth() gates on a localStorage
 *  flag that only login.js sets, so an API-only guest call is not enough. */
async function guest(browser: Browser, viewport: { width: number; height: number }) {
  const ctx = await browser.newContext({ viewport });
  const page: Page = await ctx.newPage();
  await page.goto('/login.html');
  await page.click('#btn-guest');
  await page.waitForURL(/index\.html|\/$/, { timeout: 15000 });
  return { ctx, page };
}

/** Two seated guests in a fresh room ⇒ `#start-modal` is showing on A's page. */
async function roomWithStartModal(browser: Browser, viewport: { width: number; height: number }) {
  const A = await guest(browser, viewport);
  await A.page.click('#btn-create');
  await A.page.click('#modal-advanced-toggle');
  await A.page.locator('#rule-wall').evaluate((el: HTMLInputElement) => {
    if (el.checked) { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await A.page.click('#btn-quick-match');
  // `?id=` and not just `room.html`: the id lands on the URL a tick after the
  // navigation, and B needs the full URL or it bounces back to the lobby.
  await A.page.waitForURL(/room\.html\?id=/, { timeout: 20000 });
  const roomUrl = A.page.url();

  const B = await guest(browser, viewport);
  await B.page.goto(roomUrl);
  await expect(B.page.locator('#room-id-nav')).not.toHaveText('', { timeout: 20000 });

  await A.page.locator('#slot-1 .slot-card__clickable').click();
  await B.page.locator('#slot-2 .slot-card__clickable').click();
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
    const overlay = box('#start-modal')!;
    const drawer = box('.panel-right-shell')!;
    return {
      overlay, drawer,
      card: box('.start-modal__card')!,
      canvas: box('#game-canvas')!,
      xOverlap: Math.max(0, Math.min(overlay.right, drawer.right) - Math.max(overlay.left, drawer.left)),
      yOverlap: Math.max(0, Math.min(overlay.bottom, drawer.bottom) - Math.max(overlay.top, drawer.top)),
    };
  });
}

/** The class is the single source of truth the CSS keys off (room.js never
 *  sets inline styles for it), so toggling it directly is the whole state. */
async function setDrawerCollapsed(page: Page, collapsed: boolean) {
  await page.evaluate((c) => { document.body.classList.toggle('zen-drawer-collapsed', c); }, collapsed);
  await page.waitForTimeout(500); // padding-right/inset transition is 0.35s
}

test.describe('Start Modal overlay stays over the board, not over the drawer', () => {
  for (const collapsed of [false, true]) {
    test(`desktop, drawer ${collapsed ? 'collapsed' : 'open'}: card centres on the board and the overlay clears the drawer`, async ({ browser }) => {
      test.setTimeout(60_000);
      const { A, B } = await roomWithStartModal(browser, DESKTOP);
      await setDrawerCollapsed(A.page, collapsed);

      const g = await geometry(A.page);
      // Before the fix: 170px off with the drawer open, 28px collapsed.
      expect(Math.abs(g.card.cx - g.canvas.cx)).toBeLessThanOrEqual(2);
      // Before the fix: 340px of overlap open (the drawer's full width), 56px
      // collapsed (the rail's full width).
      expect(g.xOverlap).toBe(0);
      // The overlay must not reach past the board's own box either.
      expect(g.overlay.right).toBeLessThanOrEqual(g.drawer.left + 1);

      await A.ctx.close();
      await B.ctx.close();
    });
  }

  for (const collapsed of [false, true]) {
    test(`mobile, sheet ${collapsed ? 'collapsed' : 'open'}: overlay keeps the full-width strip above the sheet`, async ({ browser }) => {
      test.setTimeout(60_000);
      const { A, B } = await roomWithStartModal(browser, MOBILE);
      await setDrawerCollapsed(A.page, collapsed);

      const g = await geometry(A.page);
      // The desktop inset must NOT leak here — the sheet is full-width at the
      // bottom, so the overlay keeps the full viewport width.
      expect(g.overlay.left).toBe(0);
      expect(g.overlay.right).toBe(MOBILE.width);
      expect(Math.abs(g.card.cx - g.canvas.cx)).toBeLessThanOrEqual(2);
      // Horizontal overlap with the sheet is total by design here; what has to
      // hold is that the strip sits ABOVE the sheet, so they never cover each
      // other (TODO.md #139).
      expect(g.yOverlap).toBe(0);

      await A.ctx.close();
      await B.ctx.close();
    });
  }
});
