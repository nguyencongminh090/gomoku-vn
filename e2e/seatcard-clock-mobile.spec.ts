import { test, expect, devices, Page, BrowserContext } from './helpers/fixtures';
import { authAsGuest } from './helpers/auth';
import { createRoom, joinRoom } from './helpers/room';

/**
 * Was strip-clock-mobile (ui/strip-clock-mobile): `.players-strip` replaced
 * `.turn-bar` on phones. Arena Focus (#216) removed both; the clocks now live
 * in the two player cards (`.seatcard__clock`, room-ui.js), on desktop and
 * phone alike. Same invariants, new markup:
 *   1. No `#turn-bar` / `#players-strip` left to eat board height.
 *   2. Before the game there is no clock (`.seatcard__clock` is only rendered
 *      for a live game), so the cards keep their height pre-game; after Start
 *      each seated card has exactly one.
 *   3. Clocks are M:SS and really count: the side to move drops, the other
 *      stands still.
 *   4. Exactly one card carries the turn marker (`.seatcard--turn`).
 *
 * Out of automated scope: the low-time (<=10s, `.seatcard--low`) look — it
 * needs a ~50s wait; the toggle is a one-line classList call in room-ui.js.
 *
 * Run: npx playwright test e2e/seatcard-clock-mobile.spec.ts --project=chromium
 */

const PHONE = devices['Pixel 5'];

test.describe('mobile player cards carry the clocks', () => {
  test('no turn bar, cards show live M:SS clocks and one turn marker', async ({ browser }) => {
    test.setTimeout(120_000);

    const made: BrowserContext[] = [];
    async function guest(): Promise<Page> {
      const ctx = await browser.newContext({ ...PHONE });
      made.push(ctx);
      const page = await ctx.newPage();
      await authAsGuest(ctx, page, 'guest', { singleTap: true });
      return page;
    }

    const A = await guest();
    const B = await guest();

    const roomUrl = await createRoom(A, { wall: false });
    await joinRoom(B, roomUrl);

    // ── Before the game: no turn bar / strip, no clocks ──
    expect(await A.locator('#turn-bar, #players-strip').count(), 'zen-era bars must stay gone').toBe(0);
    expect(await A.locator('.seatcard__clock').count(),
      'no clock is rendered before the game — that keeps the card height stable pre-game').toBe(0);

    // ── Start the game ──
    await A.locator('[data-slot="1"] .seatcard__sit').click();
    await B.locator('[data-slot="2"] .seatcard__sit').click();
    await expect(A.locator('#start-modal')).toHaveClass(/visible/, { timeout: 20000 });
    await expect(B.locator('#start-modal')).toHaveClass(/visible/, { timeout: 20000 });
    await A.click('#start-modal-btn');
    await B.click('#start-modal-btn');
    await A.waitForFunction(
      () => (window as any).RoomState?.gameState?.status === 'ongoing', null, { timeout: 25000 });

    // ── 1. Game started: still no zen-era bars; one clock per seated card ──
    expect(await A.locator('#turn-bar, #players-strip').count()).toBe(0);
    await expect(A.locator('.seatcard__clock')).toHaveCount(2);

    // ── 2. Clocks count ──
    const read = () => A.evaluate(() => {
      const cards = [...document.querySelectorAll('.seatcard')];
      return {
        times: cards.map((c) => c.querySelector('.seatcard__clock')?.textContent || ''),
        secs: cards.map((c) => {
          const m = /^(\d+):([0-5]\d)$/.exec(c.querySelector('.seatcard__clock')?.textContent || '');
          return m ? +m[1] * 60 + +m[2] : NaN;
        }),
        turns: cards.filter((c) => c.classList.contains('seatcard--turn')).length,
      };
    });

    const t0 = await read();
    for (const s of t0.times) {
      expect(s, `clock must read M:SS (got "${s}")`).toMatch(/^\d+:[0-5]\d$/);
    }

    await A.waitForTimeout(3000);
    const t1 = await read();

    const activeIdx = t0.secs.findIndex((p, i) => t1.secs[i] < p);
    expect(activeIdx, 'after 3s exactly the side to move must have counted down').toBeGreaterThanOrEqual(0);
    expect(t1.times[activeIdx]).not.toBe(t0.times[activeIdx]);

    const idleIdx = activeIdx === 0 ? 1 : 0;
    expect(t1.secs[idleIdx], 'the waiting side\'s clock must not run').toBe(t0.secs[idleIdx]);

    // ── 3. Exactly one card carries the turn marker ──
    expect(t1.turns, 'the turn marker must be on exactly one card').toBe(1);

    // Leave before the clock runs out: no game ends by timeout, so no `games` row
    // is written — this spec must not create game data.
    for (const ctx of made) await ctx.close();
  });
});
