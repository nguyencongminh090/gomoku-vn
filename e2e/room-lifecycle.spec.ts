import { test, expect, Page } from '@playwright/test';

/**
 * TEST-MATRIX.md rows 16 & 17 — room lifecycle around seating and host
 * membership, distinct from the game-in-progress lifecycle covered elsewhere.
 *
 * Row 16 (updated for TODO.md #36 / instruction.md §B36): once both slots are
 * seated, `#start-modal` becomes visible but nothing counts down yet — the
 * 15s countdown (`room.readyDeadline`, server/socket/state.js
 * handleReadyClick) only opens once one seated player clicks Start. If the
 * OTHER seated player then stands up (`room:stand`) before confirming,
 * `roomManager.resetReadyPair` clears both seats' ready state and
 * `clearReadyState` nulls `readyDeadline` — the countdown cancels and
 * `#start-modal` disappears for the remaining seated player too (their seat
 * alone isn't "both seated" any more).
 *
 * Row 17: when the host leaves via `room:leave` and a non-host member
 * remains, `RoomManager.leaveRoom` reassigns `room.host` to
 * `room.joinOrder[0]` and `room:updated` carries the new `hostId`. The client
 * renders `.slot-card__role--host` next to whoever now holds the host role.
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

async function createRoomAsHost(host: { page: Page }) {
  await host.page.goto('/index.html');
  await host.page.click('#btn-create');
  await host.page.click('#modal-advanced-toggle');
  await host.page.locator('#rule-wall').evaluate((el: HTMLInputElement) => {
    if (el.checked) { el.checked = false; el.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  await host.page.click('#btn-quick-match');
  await host.page.waitForURL(/room\.html/, { timeout: 15000 });
  await expect(host.page.locator('#room-id-nav')).not.toHaveText('', { timeout: 15000 });
  const roomId = new URL(host.page.url()).searchParams.get('id');
  expect(roomId).toBeTruthy();
  return roomId!;
}

test.describe('Room lifecycle — ready-window cancel and host transfer', () => {
  // Both tests create their own room from this local IP — serial avoids
  // tripping MAX_ROOMS_PER_IP (=3, server/config.js) under parallel workers.
  test.describe.configure({ mode: 'serial' });

  test('standing up mid-ready-window cancels the countdown for both players', async ({ browser }) => {
    test.setTimeout(60_000);

    const A = await makeGuest(browser, 'PlayerA');
    const roomId = await createRoomAsHost(A);

    const B = await makeGuest(browser, 'PlayerB');
    await B.page.goto(`/room.html?id=${encodeURIComponent(roomId)}`);
    await expect(B.page.locator('#room-id-nav')).not.toHaveText('', { timeout: 15000 });

    await A.page.locator('#slot-1 .slot-card__clickable').click();
    await B.page.locator('#slot-2 .slot-card__clickable').click();

    // Both slots seated → Start Modal is visible, but nobody has clicked
    // Start yet, so there's no countdown running (instruction.md §B36).
    await expect(A.page.locator('#start-modal')).toHaveClass(/visible/, { timeout: 15000 });
    await expect(B.page.locator('#start-modal')).toHaveClass(/visible/, { timeout: 15000 });
    const deadlineBaseline = await A.page.evaluate(() => (window as any).RoomState.roomData.readyDeadline);
    expect(deadlineBaseline, 'no countdown until someone clicks Start').toBeNull();

    // A clicks Start — this opens the 15s window for B.
    await A.page.click('#start-modal-btn');
    await A.page.waitForFunction(() => (window as any).RoomState.roomData.readyDeadline != null, null, { timeout: 10000 });
    const deadlineBefore = await A.page.evaluate(() => (window as any).RoomState.roomData.readyDeadline);
    expect(deadlineBefore, 'readyDeadline should be set once one player clicks Start').toBeTruthy();

    // B stands up before confirming — this must cancel the countdown for
    // BOTH clients, not just B, and reset A's ready flag (fresh seat pair).
    await B.page.evaluate(() => (window as any).standUp());

    await A.page.waitForFunction(() => (window as any).RoomState.roomData.readyDeadline === null, null, { timeout: 10000 });
    await B.page.waitForFunction(() => (window as any).RoomState.roomData.readyDeadline === null, null, { timeout: 10000 });
    await expect(A.page.locator('#start-modal')).not.toHaveClass(/visible/, { timeout: 10000 });
    await expect(B.page.locator('#start-modal')).not.toHaveClass(/visible/, { timeout: 10000 });

    // B is no longer seated; A's slot is untouched.
    const bSlot = await B.page.evaluate(() => (window as any).RoomState.mySlot);
    expect(bSlot).toBeNull();
    const aSlot = await A.page.evaluate(() => (window as any).RoomState.mySlot);
    expect(aSlot).toBe(1);

    await A.ctx.close();
    await B.ctx.close();
  });

  test('host leaving promotes the remaining member to host', async ({ browser }) => {
    test.setTimeout(60_000);

    const A = await makeGuest(browser, 'PlayerA (host)');
    const roomId = await createRoomAsHost(A);

    const B = await makeGuest(browser, 'PlayerB');
    await B.page.goto(`/room.html?id=${encodeURIComponent(roomId)}`);
    await expect(B.page.locator('#room-id-nav')).not.toHaveText('', { timeout: 15000 });

    const bUserId = await B.page.evaluate(() => (window as any).RoomState.myUser.userId);
    const hostIdBefore = await B.page.evaluate(() => (window as any).RoomState.roomData.hostId);
    const aUserId = await A.page.evaluate(() => (window as any).RoomState.myUser.userId);
    expect(hostIdBefore).toBe(aUserId);

    // Host leaves; not seated, so no confirm() dialog / force-resign path.
    await A.page.click('#btn-leave');
    await A.page.waitForURL(/index\.html/, { timeout: 10000 });

    await B.page.waitForFunction(
      (id) => (window as any).RoomState.roomData.hostId === id,
      bUserId,
      { timeout: 10000 }
    );

    // Client-visible host badge follows the promotion. B is unseated (a
    // spectator here), so the badge renders in the spectators list as "CP".
    await B.page.click('.tab-btn[data-tab="tab-users"]');
    await expect(B.page.locator('#users-list .slot-card__role--host')).toBeVisible({ timeout: 10000 });

    await A.ctx.close();
    await B.ctx.close();
  });
});
