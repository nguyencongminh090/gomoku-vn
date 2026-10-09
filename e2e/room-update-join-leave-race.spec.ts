import { test, expect } from './helpers/fixtures';
import { authAsGuest } from './helpers/auth';

/**
 * TODO.md #187 — a joiner's user list comes from `room:joined` (full state),
 * while later changes arrive as `room:updated` deltas (debounced 80ms,
 * server/socket/state.js). A host who left inside that window was never in
 * the delta baseline, so their removal was never sent and the joiner kept a
 * stale host entry: two "CP" badges (room-lifecycle.spec.ts, ~1 in 5 runs).
 * This forces the timing: the host leaves from inside its page the instant
 * the joiner's (undebounced) join chat message arrives.
 */
test('host leaves inside the joiner\'s 80ms debounce window -> joiner sees exactly one host', async ({ browser }) => {
  test.setTimeout(60_000);
  const aCtx = await browser.newContext(); const A = await aCtx.newPage();
  await authAsGuest(aCtx, A);
  await A.goto('/index.html'); await A.click('#btn-create'); await A.click('#btn-quick-match');
  await A.waitForURL(/room\.html\?id=/, { timeout: 15000 });
  await expect(A.locator('#room-id-nav')).not.toHaveText('', { timeout: 15000 });
  const roomId = new URL(A.url()).searchParams.get('id')!;
  // Leave from inside the page the instant B's join is announced (sent
  // immediately; the room:updated carrying B is debounced 80ms).
  await A.evaluate(() => {
    const c = (window as any).RoomClient;
    c.on('chat:message', (m: any) => { if (m && m.code === 'ROOM_PLAYER_JOINED') c.emit('room:leave'); });
  });

  const bCtx = await browser.newContext(); const B = await bCtx.newPage();
  await authAsGuest(bCtx, B);
  await B.goto(`/room.html?id=${encodeURIComponent(roomId)}`);
  const bId = await B.evaluate(async () => {
    for (let i = 0; i < 100 && !(window as any).RoomState?.myUser; i++) await new Promise(r => setTimeout(r, 50));
    return (window as any).RoomState.myUser.userId;
  });
  await B.waitForFunction((id) => (window as any).RoomState?.roomData?.hostId === id, bId, { timeout: 10000 });
  await B.waitForTimeout(500); // let any further room:updated land
  const users = await B.evaluate(() => (window as any).RoomState.roomData.users.map((u: any) => `${u.userId}:${u.role}`));
  console.log('B USERS', JSON.stringify(users));
  expect(users).toEqual([`${bId}:host`]);
  await aCtx.close(); await bCtx.close();
});
