import { test, expect, Page } from '@playwright/test';

/**
 * TODO.md #117 — a busy lobby (many concurrent rooms/players) used to feel
 * slow because `client/js/lobby.js` rebuilt the ENTIRE room list
 * (`renderRoomList` -> `#room-list`.innerHTML) on every `lobby:patch`, even
 * though the server already sends a diff (`{ upserts, removed }`). This test
 * seeds several rooms, then changes exactly one of them, and asserts that
 * only that room's DOM row is touched — not a full-list rebuild.
 */

async function makeGuest(browser: any, actor: string) {
  const ctx = await browser.newContext();
  const page: Page = await ctx.newPage();
  const res = await page.request.post('/api/auth/guest');
  expect(res.ok(), `${actor} guest auth should succeed`).toBeTruthy();
  const { token, displayName } = await res.json();
  await ctx.addInitScript(([t, d]) => {
    localStorage.setItem('gvn_token', t as string);
    localStorage.setItem('gvn_display_name', d as string);
  }, [token, displayName]);
  return { ctx, page, actor, displayName };
}

test.describe('Lobby patch incremental render (B117)', () => {
  test('a single-room lobby:patch only touches that room\'s DOM row', async ({ browser }) => {
    test.setTimeout(60_000);

    // Seed a handful of rooms so the list is non-trivial.
    const seeders: { ctx: any; page: Page }[] = [];
    for (let i = 0; i < 4; i++) {
      const { ctx, page } = await makeGuest(browser, `Seeder${i}`);
      await page.goto('/index.html');
      await page.click('#btn-create');
      await page.click('#btn-quick-match');
      await page.waitForURL(/room\.html\?id=/, { timeout: 15000 });
      seeders.push({ ctx, page });
    }

    // Observer: open the lobby and attach a MutationObserver on #room-list
    // BEFORE anything else changes.
    const { ctx: obsCtx, page: obs } = await makeGuest(browser, 'Observer');
    await obs.goto('/index.html');
    await expect(obs.locator('.room-row').first()).toBeVisible({ timeout: 15000 });
    const initialRowCount = await obs.locator('.room-row').count();
    expect(initialRowCount).toBeGreaterThan(0);

    await obs.evaluate(() => {
      (window as any).__mutations = [];
      const list = document.getElementById('room-list')!;
      const observer = new MutationObserver((records) => {
        (window as any).__mutations.push(...records);
      });
      observer.observe(list, { childList: true, subtree: true, attributes: true, characterData: true });
      (window as any).__observer = observer;
    });

    // Trigger a change in exactly one seeded room: a second guest joins it.
    const targetRoomId = new URL(seeders[0].page.url()).searchParams.get('id')!;
    const { ctx: joinerCtx, page: joiner } = await makeGuest(browser, 'Joiner');
    await joiner.goto(`/room.html?id=${encodeURIComponent(targetRoomId)}`);
    await expect(joiner.locator('#room-id-nav')).not.toHaveText('', { timeout: 15000 });

    // Let the debounced lobby:patch (300ms) land.
    await obs.waitForTimeout(1000);

    const result = await obs.evaluate((roomId) => {
      (window as any).__observer.disconnect();
      const records: MutationRecord[] = (window as any).__mutations;
      const touchedRoomIds = new Set<string>();
      let sawFullListReplace = false;
      for (const r of records) {
        if (r.type === 'childList' && (r.target as HTMLElement).id === 'room-list') {
          if (r.removedNodes.length > 1 || r.addedNodes.length > 1) sawFullListReplace = true;
        }
        const el = r.target.nodeType === 1 ? (r.target as HTMLElement) : r.target.parentElement;
        const row = el ? el.closest('.room-row') : null;
        if (row) touchedRoomIds.add((row as HTMLElement).dataset.roomId!);
      }
      return {
        mutationCount: records.length,
        touchedRoomIds: Array.from(touchedRoomIds),
        sawFullListReplace,
        finalRowCount: document.querySelectorAll('.room-row').length,
      };
    }, targetRoomId);

    expect(result.mutationCount, 'the patch must produce at least one DOM mutation').toBeGreaterThan(0);
    expect(result.touchedRoomIds, 'only the changed room\'s row should be touched').toEqual([targetRoomId]);
    expect(result.sawFullListReplace, '#room-list itself must not be replaced wholesale').toBe(false);
    expect(result.finalRowCount, 'no rows should be destroyed/recreated').toBe(initialRowCount);

    for (const s of seeders) await s.ctx.close();
    await joinerCtx.close();
    await obsCtx.close();
  });
});
