import { test, expect } from './helpers/fixtures';
import { authAsGuest } from './helpers/auth';

/**
 * TODO.md #186 — a host who never sat plus a joining viewer both drop their
 * connection (no room:leave). The first is a #115 viewer ghost; the second
 * used to take the same path, so nobody connected was left yet the room stayed
 * in the lobby (holding its creator's room quota) until the 10-min idle sweep.
 * Now the last connected user's drop starts the empty-room grace, and its
 * expiry removes the ghost too.
 */
test('room of two unseated users, both crashed, disappears after the empty-room grace', async ({ browser }) => {
  test.setTimeout(120_000);
  const hostCtx = await browser.newContext(); const host = await hostCtx.newPage();
  await authAsGuest(hostCtx, host);
  await host.goto('/index.html'); await host.click('#btn-create'); await host.click('#btn-quick-match');
  await host.waitForURL(/room\.html\?id=/, { timeout: 15000 });
  const roomId = new URL(host.url()).searchParams.get('id')!;
  const jCtx = await browser.newContext(); const joiner = await jCtx.newPage();
  await authAsGuest(jCtx, joiner);
  await joiner.goto(`/room.html?id=${encodeURIComponent(roomId)}`);
  await expect(joiner.locator('#room-id-nav')).not.toHaveText('', { timeout: 15000 });

  const oCtx = await browser.newContext(); const obs = await oCtx.newPage();
  await authAsGuest(oCtx, obs);
  await obs.goto('/index.html');
  const row = obs.locator(`.room-row[data-room-id="${roomId}"]`);
  await expect(row).toBeVisible({ timeout: 15000 });

  // Network-drop style disconnect: no room:leave, no auto-reconnect.
  const drop = (p: any) => p.evaluate(() => {
    const s = (window as any).RoomClient.socket;
    s.io.reconnection(false);
    s.io.engine.close();
  });
  const t0 = Date.now();
  await drop(joiner);
  await drop(host);
  await expect(row).toHaveCount(0, { timeout: 60_000 });
  console.log(`ROOM GONE after ${Date.now() - t0} ms`);
  await oCtx.close();
});
