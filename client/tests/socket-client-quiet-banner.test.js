/**
 * #367 — the top "Mất kết nối / Kết nối lại (lần n)" banner flashed on every
 * short network blip, which reads as an unstable site even though the room
 * auto-rejoins. It now appears only after the connection has stayed lost for
 * SocketClient.BANNER_DELAY_MS, and never if it comes back first.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'socket-client.js'), 'utf8');

function setup() {
  const handlers = {};
  const ioHandlers = {};
  const sock = {
    connected: true,
    auth: {},
    on: jest.fn((e, cb) => { handlers[e] = cb; }),
    off: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    io: { on: jest.fn((e, cb) => { ioHandlers[e] = cb; }) },
  };
  delete window.SocketClient;
  window.__gvnSharedClient = null;
  window.io = () => sock;
  window.t = (k, v) => (v && v.n != null ? `${k}:${v.n}` : k);
  window.GvnSession = { hasBelievedSession: () => true, legacyToken: () => null };
  window.eval(SRC);
  const client = new window.SocketClient();
  const el = document.createElement('div');
  client.bindStatusBanner(el);
  return { handlers, ioHandlers, client, el };
}

describe('#367 quiet connection banner', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('delay is 8 s', () => {
    setup();
    expect(window.SocketClient.BANNER_DELAY_MS).toBe(8000);
  });

  test('a blip that reconnects before the delay never shows the banner', () => {
    const { handlers, ioHandlers, el } = setup();
    handlers.disconnect('transport close');
    ioHandlers.reconnect_attempt(1);
    jest.advanceTimersByTime(7999);
    expect(el.classList.contains('visible')).toBe(false);
    handlers.connect();
    jest.advanceTimersByTime(20000);
    expect(el.classList.contains('visible')).toBe(false);
  });

  test('a drop lasting past the delay shows the latest status, then hides on connect', () => {
    const { handlers, ioHandlers, el } = setup();
    handlers.disconnect('transport close');
    ioHandlers.reconnect_attempt(1);
    ioHandlers.reconnect_attempt(2);
    jest.advanceTimersByTime(8000);
    expect(el.classList.contains('visible')).toBe(true);
    expect(el.textContent).toBe('conn.reconnecting_attempt:2');
    ioHandlers.reconnect_attempt(3); // already visible → updates in place
    expect(el.textContent).toBe('conn.reconnecting_attempt:3');
    handlers.connect();
    expect(el.classList.contains('visible')).toBe(false);
  });

  test('a second drop restarts the full delay', () => {
    const { handlers, el } = setup();
    handlers.disconnect('transport close');
    jest.advanceTimersByTime(5000);
    handlers.connect();
    handlers.disconnect('transport close');
    jest.advanceTimersByTime(5000);
    expect(el.classList.contains('visible')).toBe(false);
    jest.advanceTimersByTime(3000);
    expect(el.classList.contains('visible')).toBe(true);
    expect(el.textContent).toBe('conn.disconnected_retrying');
  });
});
