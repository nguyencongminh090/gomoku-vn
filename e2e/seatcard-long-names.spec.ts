import { test, expect, Page, Browser } from './helpers/fixtures';
import { authAsMember } from './helpers/auth';
import { createRoom, joinRoom, sit } from './helpers/room';

/**
 * Was drawer-rail-not-displaced (TODO.md #142): in the zen skin a long display
 * name grew a grid track and pushed the drawer's icon rail out of its clip.
 * The drawer is gone (#216 Arena Focus); the same class of bug now lives in
 * the rail's player cards: `.seatcard` is a grid of
 * `auto | minmax(0,1fr) | auto | auto`, and `.seatcard__name` is `nowrap`.
 * If the name column ever loses its `minmax(0, …)` floor, a long name widens
 * the card and with it the whole `.rail` column — the board shrinks, the clock
 * and ✕ are pushed out of the card.
 *
 * Real accounts with long (legal, <= 24 char) names: guest names are short
 * and hide this. Do not shorten the fixture.
 */

const VIEWPORT = { width: 1440, height: 900 };

const NAME_A = 'Nguyễn Thị Ánh Tuyết Vy';
const NAME_B = 'Trần Hoàng Minh Khôi Ng';

async function member(browser: Browser, displayName: string) {
  const ctx = await browser.newContext({ viewport: VIEWPORT });
  const page: Page = await ctx.newPage();
  await authAsMember(ctx, page, 'long', displayName);
  return { ctx, page };
}

/** Every card's content must stay inside the card, and the card inside the rail. */
async function railGeometry(page: Page) {
  return await page.evaluate(() => {
    const box = (el: Element) => el.getBoundingClientRect();
    const rail = box(document.querySelector('.rail')!);
    const cards = [...document.querySelectorAll('.seatcard')].map((card) => {
      const c = box(card);
      const inner = [...card.querySelectorAll('.seatcard__av, .seatcard__id, .seatcard__stand, .seatcard__clock, .seatcard__sit')]
        .map((e) => box(e).right);
      return {
        cardRight: +c.right.toFixed(1),
        cardWidth: +c.width.toFixed(1),
        // How far any child sticks out past the card's right edge — the defect.
        childOverflow: +(Math.max(0, ...inner.map((r) => r - c.right))).toFixed(1),
        scrollOverflow: (card as HTMLElement).scrollWidth - (card as HTMLElement).clientWidth,
      };
    });
    return { railWidth: +rail.width.toFixed(1), railRight: +rail.right.toFixed(1), cards, vw: innerWidth };
  });
}

function expectRailIntact(g: Awaited<ReturnType<typeof railGeometry>>, when: string, railW?: number) {
  if (railW !== undefined) expect(g.railWidth, `rail must keep its width (${when})`).toBe(railW);
  expect(g.railRight, `rail must stay inside the viewport (${when})`).toBeLessThanOrEqual(g.vw);
  for (const c of g.cards) {
    expect(c.childOverflow, `card content must stay inside the card (${when})`).toBeLessThanOrEqual(1);
    expect(c.scrollOverflow, `card must not scroll horizontally (${when})`).toBeLessThanOrEqual(1);
    expect(c.cardRight, `card must stay inside the rail (${when})`).toBeLessThanOrEqual(g.railRight + 1);
  }
}

test.describe('rail player cards: long names never widen the rail (TODO.md #142)', () => {
  test('rail and cards stay put through empty → one seated → both seated', async ({ browser }) => {
    test.setTimeout(90_000);
    const A = await member(browser, NAME_A);
    const roomUrl = await createRoom(A.page);

    const empty = await railGeometry(A.page);
    expectRailIntact(empty, 'nobody seated');

    await sit(A.page, 1);
    await expect(A.page.locator('[data-slot="1"] .seatcard__name')).toHaveText(NAME_A, { timeout: 15000 });
    expectRailIntact(await railGeometry(A.page), 'one long name seated', empty.railWidth);

    const B = await member(browser, NAME_B);
    await joinRoom(B.page, roomUrl);
    await sit(B.page, 2);
    await expect(A.page.locator('[data-slot="2"] .seatcard__name')).toHaveText(NAME_B, { timeout: 15000 });
    await expect(A.page.locator('#start-modal')).toHaveClass(/visible/, { timeout: 20000 });
    expectRailIntact(await railGeometry(A.page), 'both long names seated, start modal up', empty.railWidth);

    await A.ctx.close();
    await B.ctx.close();
  });

  test('long names are ellipsised rather than widening the card', async ({ browser }) => {
    test.setTimeout(60_000);
    const A = await member(browser, NAME_A);
    await createRoom(A.page);
    await sit(A.page, 1);
    const nameEl = A.page.locator('[data-slot="1"] .seatcard__name');
    await expect(nameEl).toHaveText(NAME_A, { timeout: 15000 });

    // The server caps names at 24 chars and those fit the 340px rail, so force
    // the overflow: a 60-char name in the same box.
    const before = await railGeometry(A.page);
    const m = await nameEl.evaluate((el) => {
      el.textContent = 'W'.repeat(60);
      return {
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        textOverflow: getComputedStyle(el).textOverflow,
      };
    });
    // Wider than its box and clipped with an ellipsis: that is how an over-long
    // name is absorbed, instead of the card (and the rail) growing.
    expect(m.scrollWidth).toBeGreaterThan(m.clientWidth);
    expect(m.textOverflow).toBe('ellipsis');

    expectRailIntact(await railGeometry(A.page), 'ellipsised name', before.railWidth);
    await A.ctx.close();
  });
});
