import { Page, expect } from '@playwright/test';

/**
 * Create a room through the lobby UI ("Tạo phòng" → Tạo nhanh) and wait for
 * room.html?id=… — `?id=` lands a tick after the navigation, and a second
 * player needs the full URL or bounces back to the lobby (TODO.md #141).
 * `page` must already be signed in on a fresh load (authAsGuest/authAsMember),
 * so `#rooms` is the first thing the lobby shows.
 */
export async function createRoom(page: Page, opts: { wall?: boolean } = {}): Promise<string> {
  await page.goto('/index.html#rooms');
  await page.click('#btn-create');
  if (opts.wall === false) {
    await page.click('#modal-advanced-toggle');
    await page.locator('#rule-wall').evaluate((el: HTMLInputElement) => {
      if (el.checked) { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); }
    });
  }
  await page.click('#btn-quick-match');
  await page.waitForURL(/room\.html\?id=/, { timeout: 20000 });
  return page.url();
}

/** Open `roomUrl` as a second player and wait until the room has loaded. */
export async function joinRoom(page: Page, roomUrl: string) {
  await page.goto(roomUrl);
  await expect(page.locator('#room-id-nav')).not.toHaveText('', { timeout: 20000 });
}

export const sit = (page: Page, slot: 1 | 2) => page.locator(`[data-slot="${slot}"] .seatcard__sit`).click();
