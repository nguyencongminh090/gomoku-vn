import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

/**
 * TODO.md #426 — on phones tournament-match.html's board was wider than the
 * viewport (390px: #board-wrap 420px at left -15, clipped both sides).
 *
 * Root cause is pure CSS: room.css's mobile `.board-area-shell` full-bleed
 * (width: calc(100% + 32px); margin-left: -16px) assumes a 16px .room padding
 * that the same mobile block sets to 0. room.html cancels it in
 * room-arena.css (body.arena-room); this page did not, so the shell (and the
 * board BoardRenderer.resize() fits into it) overshot 16px per side.
 *
 * The page is served straight from client/ via page.route with every script
 * aborted: no server, no DB (playwright-e2e-safety), and requireAuth() can't
 * redirect. What is measured is the layout box the board is sized from.
 */

const CLIENT = path.join(__dirname, '..', 'client');
const ORIGIN = 'http://tmatch-layout.test';
const TYPES: Record<string, string> = {
  '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png',
};

for (const width of [360, 375, 390]) {
  test(`${width}px: board shell and wrap stay inside the viewport`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 800 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.route(`${ORIGIN}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.endsWith('.js')) return route.abort();
      const file = path.join(CLIENT, decodeURIComponent(url.pathname));
      if (!file.startsWith(CLIENT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        return route.fulfill({ status: 404, body: '' });
      }
      return route.fulfill({
        status: 200,
        contentType: TYPES[path.extname(file)] || 'application/octet-stream',
        body: fs.readFileSync(file),
      });
    });
    await page.goto(`${ORIGIN}/tournament-match.html`);

    const m = await page.evaluate(() => {
      const box = (sel: string) => {
        const r = document.querySelector(sel)!.getBoundingClientRect();
        return { left: r.left, right: r.right };
      };
      return {
        vw: document.documentElement.clientWidth,
        scrollW: document.documentElement.scrollWidth,
        shell: box('#board-area-shell'),
        wrap: box('#board-wrap'),
        card: box('#seatcard-top'),
        frame: (() => {
          const cs = getComputedStyle(document.querySelector('#board-area')!);
          return { border: cs.borderLeftWidth, radius: cs.borderTopLeftRadius, shadow: cs.boxShadow };
        })(),
      };
    });

    for (const [name, r] of [['shell', m.shell], ['wrap', m.wrap], ['seat card', m.card]] as const) {
      expect(r.left, `${name} must not start left of the viewport`).toBeGreaterThanOrEqual(0);
      expect(r.right, `${name} must not end past the viewport`).toBeLessThanOrEqual(m.vw);
    }
    // The board gets the full phone width: no side inset and no leftover
    // .board-area desktop frame (its rounded border peeked past the board) …
    expect(m.wrap.right - m.wrap.left).toBe(m.vw);
    expect(m.frame).toEqual({ border: '0px', radius: '0px', shadow: 'none' });
    // … and the page itself never scrolls sideways.
    expect(m.scrollW).toBeLessThanOrEqual(m.vw);
    await ctx.close();
  });
}
