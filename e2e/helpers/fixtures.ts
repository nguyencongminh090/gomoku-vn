import { test as base, BrowserContext } from '@playwright/test';

/**
 * Drop-in replacement for `test` from '@playwright/test' (TODO.md #183).
 *
 * Why: the server caps rooms per IP (MAX_ROOMS_PER_IP = 3) and every spec's
 * players come from the same IP. A room whose seated players merely disconnect
 * (their context is closed at the end of the test) is kept for
 * DISCONNECT_GRACE_MS (60 s, "interrupted") and keeps counting against that
 * cap — so after ~3 game specs run back to back, every later spec's
 * "create room" is refused and times out at `waitForURL(room.html?id=…)`.
 *
 * What: every context a spec creates with `browser.newContext()` is wrapped so
 * that closing it — whether the spec does it or Playwright's end-of-test
 * cleanup does — first makes each open page leave its room explicitly
 * (`room:leave`), which frees the room immediately instead of after the grace
 * period. Playwright does NOT close contexts a test made with
 * `browser.newContext()` (they live until the worker's browser closes), so a
 * test that fails or forgets to close one would keep its room alive; fixture
 * teardown therefore closes every still-open tracked context (#441). The quota
 * itself stays at 3 because leave-then-create-room.spec.ts asserts it.
 */
async function leaveRooms(ctx: BrowserContext) {
  for (const page of ctx.pages()) {
    // Best effort: a page may be closed, mid-navigation, or not on room.html.
    await page.evaluate(() => {
      const c = (window as any).RoomClient;
      if (c && c.socket && c.socket.connected) c.emit('room:leave');
    }).catch(() => {});
  }
  // Let the leave events reach the server before the sockets drop.
  await new Promise((r) => setTimeout(r, 250));
}

/**
 * Close `ctx` WITHOUT leaving its rooms first, i.e. simulate a dropped
 * connection (seats are kept, the room goes "interrupted"). Use only in specs
 * whose point is the disconnect itself; the room then lingers for the server's
 * DISCONNECT_GRACE_MS and counts against the per-IP room cap until it expires.
 */
export async function dropConnection(ctx: BrowserContext) {
  (ctx as any).__dropWithoutLeaving = true;
  await ctx.close();
}

export const test = base.extend<{ _leaveRoomsOnClose: void }>({
  _leaveRoomsOnClose: [async ({ browser }, use) => {
    const original = browser.newContext.bind(browser);
    const opened = new Set<BrowserContext>();
    (browser as any).newContext = async (...args: any[]) => {
      const ctx: BrowserContext = await (original as any)(...args);
      opened.add(ctx);
      const close = ctx.close.bind(ctx);
      let leaving = false;
      (ctx as any).close = async (...a: any[]) => {
        opened.delete(ctx);
        if (!leaving && !(ctx as any).__dropWithoutLeaving) { leaving = true; await leaveRooms(ctx); }
        return (close as any)(...a);
      };
      return ctx;
    };
    try {
      await use();
    } finally {
      (browser as any).newContext = original;
      // Close any manually created contexts that a test failed before closing
      // (or forgot to close) so their rooms emit room:leave immediately instead
      // of lingering in empty-room grace and starving later specs of MAX_ROOMS_PER_IP.
      for (const ctx of [...opened]) {
        await ctx.close().catch(() => {});
      }
    }
  }, { auto: true }],
});

export { expect, devices } from '@playwright/test';
export type { Page, Browser, BrowserContext } from '@playwright/test';
