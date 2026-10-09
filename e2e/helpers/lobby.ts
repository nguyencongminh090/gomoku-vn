import { Browser } from '@playwright/test';
import { authAsGuest } from './auth';

/**
 * Wait until the server has no rooms left (TODO.md #183).
 *
 * For specs that need the per-IP room quota (MAX_ROOMS_PER_IP = 3) completely
 * free: a room left "interrupted" by an earlier spec that simulated a
 * disconnect (kick-blocked-interrupted.spec.ts) lingers for the server's
 * DISCONNECT_GRACE_MS (60 s) and would otherwise eat one of the slots.
 * Reads the lobby as a throwaway guest, so it needs no server access beyond
 * what a browser has.
 */
export async function waitForEmptyLobby(browser: Browser, timeoutMs = 90_000) {
  const ctx = await browser.newContext();
  try {
    const page = await ctx.newPage();
    await authAsGuest(ctx, page, 'lobby-probe');
    await page.goto('/index.html');
    await page.locator('#room-list').waitFor({ state: 'attached' });
    await page.waitForFunction(
      () => document.querySelectorAll('#room-list .room-row').length === 0,
      null,
      { timeout: timeoutMs, polling: 1000 },
    );
  } finally {
    await ctx.close();
  }
}
