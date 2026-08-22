import { test, expect, Page, Browser } from '@playwright/test';

/**
 * TODO.md #142 — `.panel-right` is a fixed-width grid whose column track was
 * `1fr var(--zen-rail-w)`. `1fr` is `minmax(auto, 1fr)`, and that `auto` floor
 * is the min-content width of `.panel-players`. `.slot-card__name` carries
 * `white-space: nowrap`, so its min-content is the full player name — and
 * `min-width: 0` does not lower the intrinsic min-content a grid track sizes
 * against. Once both seats filled with real (long) display names, the content
 * column outgrew the drawer's fixed width and pushed the fixed-width rail track
 * out past `.panel-right-shell`'s `overflow: hidden`, so the icon rail was
 * partly or entirely clipped away.
 *
 * The bug is invisible with short auto-generated guest names, which is why it
 * survived several rounds of investigation — these tests therefore use REAL
 * accounts with long (but legal, <= 24 char) Vietnamese display names. That
 * length is the whole point of the fixture; do not shorten it.
 *
 * The guard is the rail's geometry, not a screenshot: the rail must sit fully
 * inside the shell in every seating state.
 */

const VIEWPORT = { width: 1920, height: 995 };

/** 23 chars — comfortably under the server's 24-char limit, long enough that
 *  the old `1fr` track blew out by ~191px at this viewport. */
const NAME_A = 'Nguyễn Thị Ánh Tuyết Vy';
const NAME_B = 'Trần Hoàng Minh Khôi Ng';

async function register(browser: Browser, username: string, displayName: string) {
  const ctx = await browser.newContext({ viewport: VIEWPORT });
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

/** Rail box vs shell box. Everything here must hold at every seating state. */
async function railGeometry(page: Page) {
  return await page.evaluate(() => {
    const rail = document.querySelector('.sidebar-tabs')!.getBoundingClientRect();
    const shell = document.querySelector('.panel-right-shell')!.getBoundingClientRect();
    const panelRight = document.querySelector('.panel-right')!.getBoundingClientRect();
    return {
      tracks: getComputedStyle(document.querySelector('.panel-right')!).gridTemplateColumns,
      railLeft: +rail.left.toFixed(2),
      railWidth: +rail.width.toFixed(2),
      // How far the rail sticks out past the shell's right edge — the defect.
      overflowPastShell: +(rail.right - shell.right).toFixed(2),
      // How much of the rail the user can actually see through the clip.
      visibleWidth: +(Math.min(rail.right, shell.right) - Math.max(rail.left, shell.left)).toFixed(2),
      // Offset of the rail track inside the fixed-width grid.
      trackOffset: +(rail.left - panelRight.left).toFixed(2),
    };
  });
}

function expectRailIntact(g: Awaited<ReturnType<typeof railGeometry>>, when: string) {
  // Before the fix, with these names: overflow 191px and visibleWidth 0.
  expect(g.overflowPastShell, `rail must not be pushed out of the shell (${when})`).toBeLessThanOrEqual(1);
  expect(g.visibleWidth, `the whole rail must stay visible (${when})`).toBeGreaterThanOrEqual(g.railWidth - 1);
}

test.describe('zen drawer: long player names never displace the icon rail (TODO.md #142)', () => {
  test('rail stays put through empty → one seated → both seated → collapsed', async ({ browser }) => {
    test.setTimeout(90_000);
    const stamp = Date.now().toString().slice(-6);

    const A = await register(browser, `railA${stamp}`, NAME_A);
    await A.page.click('#btn-create');
    if (await A.page.locator('#modal-advanced-toggle').isVisible().catch(() => false)) {
      await A.page.click('#modal-advanced-toggle');
    }
    const quick = A.page.locator('#btn-quick-match');
    if (await quick.isVisible().catch(() => false)) await quick.click();
    else await A.page.click('#modal-confirm');
    // `?id=` lands a tick after the navigation (see TODO.md #141).
    await A.page.waitForURL(/room\.html\?id=/, { timeout: 20000 });
    const roomUrl = A.page.url();

    expectRailIntact(await railGeometry(A.page), 'nobody seated');

    await A.page.locator('#slot-1 .slot-card__clickable').click();
    await expect(A.page.locator('#slot-1 .slot-card__name')).toHaveText(NAME_A, { timeout: 15000 });
    expectRailIntact(await railGeometry(A.page), 'one long name seated');

    const B = await register(browser, `railB${stamp}`, NAME_B);
    await B.page.goto(roomUrl);
    await expect(B.page.locator('#room-id-nav')).not.toHaveText('', { timeout: 20000 });
    await B.page.locator('#slot-2 .slot-card__clickable').click();
    await expect(A.page.locator('#start-modal')).toHaveClass(/visible/, { timeout: 20000 });

    const seated = await railGeometry(A.page);
    expectRailIntact(seated, 'both long names seated, start modal up');
    // The content column must still be the drawer width minus the rail, not
    // the names' min-content (which is ~474px here).
    expect(seated.trackOffset).toBeLessThanOrEqual(300);

    // Collapsed is where the displacement showed up as a doubled border: the
    // rail's own border-left landing a few px off the shell's.
    await A.page.click('.tab-btn[data-tab="tab-chat"]');
    await A.page.waitForTimeout(800);   // 0.35s width transition, with margin
    const collapsed = await railGeometry(A.page);
    expectRailIntact(collapsed, 'collapsed');
    // Both borders must coincide, or the user sees two hairlines.
    expect(Math.abs(collapsed.railLeft - (await A.page.evaluate(
      () => document.querySelector('.panel-right-shell')!.getBoundingClientRect().left
    )))).toBeLessThanOrEqual(1);

    await A.ctx.close();
    await B.ctx.close();
  });

  test('long names are ellipsised rather than widening the drawer', async ({ browser }) => {
    test.setTimeout(60_000);
    const stamp = Date.now().toString().slice(-6);

    const A = await register(browser, `railE${stamp}`, NAME_A);
    await A.page.click('#btn-create');
    if (await A.page.locator('#modal-advanced-toggle').isVisible().catch(() => false)) {
      await A.page.click('#modal-advanced-toggle');
    }
    const quick = A.page.locator('#btn-quick-match');
    if (await quick.isVisible().catch(() => false)) await quick.click();
    else await A.page.click('#modal-confirm');
    await A.page.waitForURL(/room\.html\?id=/, { timeout: 20000 });

    await A.page.locator('#slot-1 .slot-card__clickable').click();
    const nameEl = A.page.locator('#slot-1 .slot-card__name');
    await expect(nameEl).toHaveText(NAME_A, { timeout: 15000 });

    const m = await nameEl.evaluate((el) => ({
      clientWidth: el.clientWidth,
      scrollWidth: el.scrollWidth,
      overflow: getComputedStyle(el).overflow,
      textOverflow: getComputedStyle(el).textOverflow,
    }));
    // The full text is wider than the box and clipped with an ellipsis — that
    // is the intended way this name is absorbed, instead of the drawer growing.
    expect(m.scrollWidth).toBeGreaterThan(m.clientWidth);
    expect(m.textOverflow).toBe('ellipsis');

    expectRailIntact(await railGeometry(A.page), 'ellipsised name');
    await A.ctx.close();
  });
});
