/**
 * #415 — socket-direct route in socket-client.js.
 *
 * Pins: no `gvn_sock` cookie → `io(opts)` exactly as before; cookie → `io(url, opts)` with the
 * one-time nonce in the query (never in auth, never re-sent after fallback); fallback re-points the ONE Manager to the page origin (never a second socket),
 * on ticket refusal at any time, on the first failed connect, or after DIRECT_MAX_FAILS failed
 * reconnects of a socket that had connected; the fallback sticks for the tab.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'socket-client.js'), 'utf8');

function makeSocketStub() {
  const handlers = {};
  const sock = {
    on: jest.fn((ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); }),
    off: jest.fn(), emit: jest.fn(), disconnect: jest.fn(), connect: jest.fn(),
    io: { on: jest.fn(), uri: null, timeout: jest.fn(), opts: {} },
    auth: {},
    fire: (ev, ...a) => (handlers[ev] || []).forEach((fn) => fn(...a)),
  };
  return sock;
}

function setup({ cookie = null } = {}) {
  delete window.SocketClient;
  window.__gvnSharedClient = null;
  document.cookie.split(';').forEach((c) => { document.cookie = c.split('=')[0].trim() + '=; Max-Age=0; path=/'; });
  if (cookie) document.cookie = cookie;
  const calls = [];
  let sock;
  window.io = (...args) => { calls.push(args); sock = makeSocketStub(); const o = args[1] || args[0]; sock.auth = o.auth; sock.io.opts = { query: o.query }; return sock; };
  window.GvnSession = {
    hasBelievedSession: () => true, legacyToken: () => null,
    applyServerIdentity: jest.fn(), getUser: () => null, clearUser: jest.fn(),
  };
  // eslint-disable-next-line no-eval
  window.eval(SRC);
  const client = new window.SocketClient();
  return { calls, sock, client };
}

const routeCookie = (u = 'https://direct.example', n = 'NONCE1') =>
  `gvn_sock=${encodeURIComponent(JSON.stringify({ u, n }))}; path=/`;

beforeEach(() => { sessionStorage.clear(); });

test('no route cookie → io(opts) unchanged, no ticket', () => {
  const { calls } = setup();
  expect(calls).toHaveLength(1);
  expect(calls[0]).toHaveLength(1);
  expect(calls[0][0].auth).toEqual({});
  expect(calls[0][0].timeout).toBe(12000);
});

test('route cookie → io(url, opts) with nonce in query, not auth, and short timeout', () => {
  const { calls } = setup({ cookie: routeCookie() });
  expect(calls[0][0]).toBe('https://direct.example');
  expect(calls[0][1].query).toEqual({ gvn_n: 'NONCE1' });
  expect(calls[0][1].auth).toEqual({});
  expect(calls[0][1].withCredentials).toBe(true); // carries the direct host's HttpOnly cookie on reconnect
  expect(calls[0][1].timeout).toBe(window.SocketClient.DIRECT_TIMEOUT_MS);
  expect(calls[0][1].transports).toEqual(['websocket', 'polling']);
});

test.each([
  ['not JSON', 'gvn_sock=garbage; path=/'],
  ['non-http url', routeCookie('javascript:alert(1)')],
  ['missing nonce', `gvn_sock=${encodeURIComponent(JSON.stringify({ u: 'https://d.example' }))}; path=/`],
])('malformed cookie (%s) → CF path', (_n, cookie) => {
  const { calls } = setup({ cookie });
  expect(calls[0]).toHaveLength(1);
});

test('recent path failure in this tab → CF path even with a cookie', () => {
  sessionStorage.setItem('gvn_sock_off', String(Date.now() - 60e3));
  const { calls } = setup({ cookie: routeCookie() });
  expect(calls[0]).toHaveLength(1);
});

test('path failure older than DIRECT_OFF_MS → direct again', () => {
  sessionStorage.setItem('gvn_sock_off', String(Date.now() - 16 * 60e3));
  const { calls } = setup({ cookie: routeCookie() });
  expect(calls[0][0]).toBe('https://direct.example');
});

test('first connect fails → same socket re-pointed to origin, nonce dropped, remembered', () => {
  const { calls, sock } = setup({ cookie: routeCookie() });
  sock.fire('connect_error', new Error('timeout'));
  expect(sock.io.uri).toBe(window.location.origin);
  expect(sock.io.timeout).toHaveBeenCalledWith(12000);
  expect(sock.io.opts.query).toEqual({});
  expect(Number(sessionStorage.getItem('gvn_sock_off'))).toBeGreaterThan(Date.now() - 5000);
  expect(sock.connect).not.toHaveBeenCalled(); // transport error: socket.io's own reconnect loop retries
  expect(calls).toHaveLength(1); // never a second io()
});

test('ticket refused (any time) → fallback and explicit reconnect', () => {
  const { sock } = setup({ cookie: routeCookie() });
  sock.fire('connect');
  sock.fire('connect_error', new Error('AUTH_TICKET'));
  expect(sock.io.uri).toBe(window.location.origin);
  expect(sock.connect).toHaveBeenCalledTimes(1);
  // e.g. phone slept past the ticket TTL: not remembered, the next page load goes direct again
  expect(sessionStorage.getItem('gvn_sock_off')).toBeNull();
  const again = setup({ cookie: routeCookie() });
  expect(again.calls[0][0]).toBe('https://direct.example');
});

test('connected once → tolerates blips, falls back after DIRECT_MAX_FAILS in a row', () => {
  const { sock } = setup({ cookie: routeCookie() });
  const max = window.SocketClient.DIRECT_MAX_FAILS;
  sock.fire('connect');
  for (let i = 0; i < max - 1; i++) sock.fire('connect_error', new Error('xhr poll error'));
  expect(sock.io.uri).toBeNull();
  sock.fire('connect'); // a success resets the streak
  for (let i = 0; i < max - 1; i++) sock.fire('connect_error', new Error('xhr poll error'));
  expect(sock.io.uri).toBeNull();
  sock.fire('connect_error', new Error('xhr poll error'));
  expect(sock.io.uri).toBe(window.location.origin);
});

test('AUTH_TICKET never sends the user to login', () => {
  const { sock } = setup({ cookie: routeCookie() });
  sock.fire('connect_error', new Error('AUTH_TICKET'));
  expect(window.GvnSession.clearUser).not.toHaveBeenCalled();
});
