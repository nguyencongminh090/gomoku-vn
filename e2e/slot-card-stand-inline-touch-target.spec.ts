import { test, expect, Browser, devices } from './helpers/fixtures';
import { authAsMember } from './helpers/auth';
import { createRoom, joinRoom, sit } from './helpers/room';

/**
 * TODO.md #143 — the `✕` stand button (own seat only, `.seatcard__stand`) sits
 * inline in the player card next to the name. In the zen card it squeezed the
 * own seat's name to ~3 characters while the opponent seat (no button) kept the
 * full row. Arena Focus (#216) rebuilt the card as a grid
 * (`auto | minmax(0,1fr) | auto | auto`) and made the button 32px — a deliberate
 * step UP from the zen 24px: the card is 64px tall (52px on phones), so 32px
 * costs no height, and 32px is a safer thumb target than the WCAG 2.2 AA floor
 * (24px) it used to sit on. So this guard now checks:
 *   1. the button is at least the 24px floor and not bigger than the card
 *      leaves room for (< 44px),
 *   2. it never overlaps the name box, and the own-seat name keeps a usable
 *      width (>= 100px) next to it — the original #143 symptom,
 *   3. a REAL touch tap (Pixel 5) still stands the player up.
 */

const NAME_A = 'Nguyễn Thị Ánh Tuyết Vy'; // 23 chars, own seat (has ✕)
const NAME_B = 'Trần Hoàng Minh Khôi Ng'; // 23 chars, opponent seat (no ✕)

async function seatBothPlayers(browser: Browser, contextOptions: Parameters<Browser['newContext']>[0]) {
  const ctxA = await browser.newContext(contextOptions);
  const pageA = await ctxA.newPage();
  await authAsMember(ctxA, pageA, 'stand', NAME_A);
  const roomUrl = await createRoom(pageA);
  await sit(pageA, 1);
  await expect(pageA.locator('[data-slot="1"] .seatcard__name')).toHaveText(NAME_A, { timeout: 15000 });

  const ctxB = await browser.newContext(contextOptions);
  const pageB = await ctxB.newPage();
  await authAsMember(ctxB, pageB, 'stand', NAME_B);
  await joinRoom(pageB, roomUrl);
  await sit(pageB, 2);
  await expect(pageA.locator('[data-slot="2"] .seatcard__name')).toHaveText(NAME_B, { timeout: 15000 });

  return { A: { ctx: ctxA, page: pageA }, B: { ctx: ctxB, page: pageB } };
}

test.describe('seatcard stand button: inline, touch-sized, never squeezes the name (TODO.md #143)', () => {
  test('own-seat ✕ is 24–43px, never overlaps the name, and leaves it room', async ({ browser }) => {
    test.setTimeout(60_000);
    const { A, B } = await seatBothPlayers(browser, { viewport: { width: 1440, height: 900 } });

    const g = await A.page.evaluate(() => {
      const card = document.querySelector('[data-slot="1"]')!;
      const name = card.querySelector('.seatcard__name')!.getBoundingClientRect();
      const stand = card.querySelector('.seatcard__stand')!.getBoundingClientRect();
      return {
        standWidth: +stand.width.toFixed(1),
        standHeight: +stand.height.toFixed(1),
        nameWidth: +name.width.toFixed(1),
        overlap: !(name.right <= stand.left || name.left >= stand.right || name.bottom <= stand.top || name.top >= stand.bottom),
      };
    });

    expect(g.standWidth, 'stand button must stay at/above the 24px accessibility floor').toBeGreaterThanOrEqual(24);
    expect(g.standHeight).toBeGreaterThanOrEqual(24);
    expect(g.standWidth, 'stand button must not grow past what the card leaves for it').toBeLessThan(44);
    expect(g.overlap, 'stand button must never visually overlap the name box').toBe(false);
    expect(g.nameWidth, 'own-seat name must keep a usable width next to the ✕ (#143)').toBeGreaterThanOrEqual(100);

    await A.ctx.close();
    await B.ctx.close();
  });

  test('real touch tap on the button still stands the player up', async ({ browser }) => {
    test.setTimeout(60_000);
    const { A, B } = await seatBothPlayers(browser, { ...devices['Pixel 5'] });

    const standBox = await A.page.locator('[data-slot="1"] .seatcard__stand').boundingBox();
    expect(standBox, 'stand button must be present and have a real hit box').not.toBeNull();
    expect(standBox!.width, 'stand button hit box width').toBeGreaterThanOrEqual(24);
    expect(standBox!.height, 'stand button hit box height').toBeGreaterThanOrEqual(24);

    await A.page.locator('[data-slot="1"] .seatcard__stand').tap();

    await expect(A.page.locator('[data-slot="1"].seatcard--empty')).toBeVisible({ timeout: 5000 });
    await expect(A.page.locator('[data-slot="1"] .seatcard__name')).toHaveCount(0);

    await A.ctx.close();
    await B.ctx.close();
  });
});
