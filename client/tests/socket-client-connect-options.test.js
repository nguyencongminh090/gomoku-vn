/**
 * TODO.md #131 — `client/js/socket-client.js` passed no `timeout` to `io()`,
 * so socket.io-client's default of 20 000 ms governed how long one dead
 * connection attempt could hang before the reconnect loop took over.
 *
 * Measured in a HAR from a real player (2026-08-19 20:47, `room.html`): the
 * first WebSocket never answered — `blocked=44 616 ms, connect=7 196 ms`, the
 * SYN-retransmit signature of packet loss on the browser↔Cloudflare-edge leg —
 * the client waited out the full 20 s, and the retry then connected in 2.9 s.
 * ~24 s on "Đang kết nối…", 20 of them spent on an attempt already dead.
 *
 * This guards the whole connect-options object, not just `timeout`, because
 * every field in it is a measured decision that a later edit could quietly
 * undo — `transports` being websocket-first in particular is load-test output
 * (docs/stress-test-report.md §10, TODO.md #28/#29), not a default, and
 * reading the HAR could easily tempt someone into "fixing" it back to
 * polling-first even though the packet loss is at the TCP layer and would hit
 * polling identically.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SOCKET_CLIENT_JS_PATH = path.join(__dirname, '..', 'js', 'socket-client.js');
const SOCKET_CLIENT_JS_SOURCE = fs.readFileSync(SOCKET_CLIENT_JS_PATH, 'utf8');

/** A socket stub recording every listener, so `.on(...)` during construction is a no-op. */
function makeSocketStub() {
  return {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    io: { on: jest.fn() },
    auth: {},
  };
}

/**
 * Load socket-client.js the way the browser does (plain <script>, assigns
 * `window.SocketClient`), with `io` stubbed, and construct one client.
 *
 * @returns {{options: object, calls: number}} the options object handed to `io()`
 */
function constructAndCaptureOptions({ believedSession = true, legacyToken = null } = {}) {
  delete window.SocketClient;
  const ioCalls = [];
  window.io = (options) => {
    ioCalls.push(options);
    return makeSocketStub();
  };
  window.GvnSession = {
    hasBelievedSession: () => believedSession,
    legacyToken: () => legacyToken,
    applyServerIdentity: jest.fn(),
    getUser: () => null,
  };
  // Plain non-module script — evaluate it in this test's jsdom global, same
  // pattern as room-slot-status-active-inactive.test.js.
  // eslint-disable-next-line no-eval
  window.eval(SOCKET_CLIENT_JS_SOURCE);
  new window.SocketClient();
  return { options: ioCalls[0], calls: ioCalls.length };
}

describe('SocketClient connect options (TODO #131)', () => {
  let options;

  beforeEach(() => {
    ({ options } = constructAndCaptureOptions());
  });

  // ── The fix itself ────────────────────────────────────────────────────────
  test('passes an explicit connect timeout instead of inheriting the 20 s default', () => {
    expect(options.timeout).toBe(8000);
  });

  test('timeout leaves headroom over the slowest handshake actually observed (2.9 s)', () => {
    // Below ~3 s would start cutting short attempts that do succeed through
    // the tunnel; at/above 20 s the fix is undone. Guards the intent, not just
    // the literal number, so a future retune has to stay inside the measured
    // envelope.
    expect(options.timeout).toBeGreaterThan(2900);
    expect(options.timeout).toBeLessThan(20000);
  });

  // ── Everything the fix must NOT have disturbed ────────────────────────────
  test('keeps websocket-first transport order with tryAllTransports fallback', () => {
    expect(options.transports).toEqual(['websocket', 'polling']);
    expect(options.tryAllTransports).toBe(true);
  });

  test('keeps the unbounded reconnect loop and its backoff bounds', () => {
    expect(options.reconnection).toBe(true);
    expect(options.reconnectionAttempts).toBe(Infinity);
    expect(options.reconnectionDelay).toBe(1000);
    expect(options.reconnectionDelayMax).toBe(5000);
  });

  test('a dead attempt is abandoned before the backoff ceiling makes retrying cheap', () => {
    // The fix only pays off if `timeout` is what ends a hung attempt; if it
    // ever crept below reconnectionDelayMax the client would thrash instead.
    expect(options.timeout).toBeGreaterThan(options.reconnectionDelayMax);
  });

  test('keeps cookie-based handshake auth (TODO #68)', () => {
    expect(options.withCredentials).toBe(true);
    expect(options.auth).toEqual({});
  });

  // ── Auth-payload edge cases ───────────────────────────────────────────────
  test('a leftover pre-#68 localStorage token still rides along as auth.token', () => {
    const { options: withLegacy } = constructAndCaptureOptions({ legacyToken: 'legacy-jwt' });
    expect(withLegacy.auth).toEqual({ token: 'legacy-jwt' });
    expect(withLegacy.timeout).toBe(8000);
  });

  test('no believed session → redirects to login without opening a socket at all', () => {
    const replace = jest.fn();
    delete window.location;
    window.location = { replace };
    const { calls } = constructAndCaptureOptions({ believedSession: false });
    expect(calls).toBe(0);
    expect(replace).toHaveBeenCalledWith('login.html');
  });
});
