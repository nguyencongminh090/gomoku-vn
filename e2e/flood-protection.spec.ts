import { test, expect } from '@playwright/test';
import { io as ioClient, Socket } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

/**
 * TEST-MATRIX.md row 23 + TODO.md item 24 — socket flood protection
 * (server/socket/SocketHandler.js io.use middleware, ~line 51-82).
 *
 * Algorithm (confirmed by reading the source): purely PER-SOCKET closure
 * state (eventCount/warnedThisWindow/violationStreak), fixed 1s setInterval
 * bucket, no shared/cross-socket or per-IP counter at all. >50 events in a
 * window -> one `room:error` warning ('Bạn đang gửi quá nhiều yêu cầu. Vui
 * lòng chờ.') + the rest of that window's events dropped; 5 CONSECUTIVE
 * violating windows -> `socket.disconnect(true)` with no extra warning
 * first. A single clean window hard-resets the streak.
 *
 * No browser/page needed — this drives raw socket.io-client connections
 * directly, the same pattern as the "outsider" probe in
 * security-boundary.spec.ts. Identities are JWTs signed directly with the
 * server's own secret (same shape as server/routes/auth.js signToken())
 * rather than minted via POST /api/auth/guest, since check B alone needs
 * hundreds of distinct connections — far beyond the 20-req/15min guest-auth
 * rate limit from one test-runner IP. This is a test-only bypass against the
 * local server, not a path exposed to real users, and doesn't validate the
 * guest-auth endpoint itself (that's rows 20/22).
 */

const SERVER_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
const config = require('../server/config.js');

function mintToken(displayName: string) {
  const userId = 'flood_' + uuidv4().slice(0, 8);
  return jwt.sign(
    { userId, username: userId, displayName, isGuest: true },
    config.JWT_SECRET,
    { expiresIn: config.JWT_GUEST_EXPIRY }
  );
}

function connect(token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioClient(SERVER_URL, { auth: { token }, reconnection: false, timeout: 10000 });
    const to = setTimeout(() => { s.close(); reject(new Error('connect timeout')); }, 10000);
    s.on('connect', () => { clearTimeout(to); resolve(s); });
    s.on('connect_error', (err) => { clearTimeout(to); reject(err); });
  });
}

test.describe('Socket flood protection', () => {
  test('a single socket flooding past the per-second cap gets warned then force-disconnected', async () => {
    test.setTimeout(20_000);

    const socket = await connect(mintToken('Flooder'));

    let warnings = 0;
    let disconnected = false;
    let disconnectReason: string | null = null;
    socket.on('room:error', (d: { message: string }) => {
      warnings++;
      expect(d.message).toContain('quá nhiều yêu cầu');
    });
    socket.on('disconnect', (reason: string) => { disconnected = true; disconnectReason = reason; });

    // Harmless, unregistered event name fired continuously and fast — the
    // flood middleware counts every incoming packet regardless of whether
    // any handler exists for it, so this has zero side effects on room/game
    // state. ~200 events/sec while connected, well over the 50/sec cap.
    const floodInterval = setInterval(() => {
      if (socket.connected) {
        for (let i = 0; i < 20; i++) socket.emit('flood:probe', { i });
      }
    }, 100);

    // FLOOD_DISCONNECT_STREAK (5) consecutive 1s violating windows must
    // elapse before disconnect — give it comfortably more than 5s.
    await new Promise((r) => setTimeout(r, 7000));
    clearInterval(floodInterval);

    expect(warnings, 'at least one flood warning should have fired').toBeGreaterThan(0);
    expect(disconnected, `socket should be force-disconnected after ${config.FLOOD_DISCONNECT_STREAK} consecutive violating windows`).toBe(true);
    expect(disconnectReason).toBe('io server disconnect'); // matches socket.disconnect(true) server-side

    if (!socket.disconnected) socket.close();
  });

  test('many sockets each individually under the cap produce zero false positives under high aggregate load', async () => {
    test.setTimeout(20_000);

    // Each socket paced well under MAX_EVENTS_PER_SECOND (50) individually,
    // but the aggregate across all of them is far higher than any single
    // socket's cap — since the real implementation has no shared/cross-socket
    // counter this shouldn't be able to false-positive, but real timer
    // jitter under heavy aggregate event-loop load is worth checking
    // empirically rather than trusting the source read alone.
    const N = 300;
    const PER_SOCKET_RATE_HZ = 40;
    const DURATION_MS = 6000;

    const sockets = await Promise.all(Array.from({ length: N }, () => connect(mintToken('Quiet'))));

    const falseWarnings: { idx: number; message: string }[] = [];
    const falseDisconnects: { idx: number; reason: string }[] = [];
    sockets.forEach((s, idx) => {
      s.on('room:error', (d: { message: string }) => falseWarnings.push({ idx, message: d.message }));
      s.on('disconnect', (reason: string) => falseDisconnects.push({ idx, reason }));
    });

    const intervalMs = 1000 / PER_SOCKET_RATE_HZ;
    const timers = sockets.map((s) => setInterval(() => {
      if (s.connected) s.emit('flood:probe', { t: Date.now() });
    }, intervalMs));

    await new Promise((r) => setTimeout(r, DURATION_MS));
    timers.forEach(clearInterval);

    expect(falseWarnings.length, `no socket should be warned while individually under the cap; got ${JSON.stringify(falseWarnings.slice(0, 5))}`).toBe(0);
    expect(falseDisconnects.length, `no socket should be disconnected while individually under the cap; got ${JSON.stringify(falseDisconnects.slice(0, 5))}`).toBe(0);

    for (const s of sockets) if (!s.disconnected) s.close();
  });
});
