/**
 * #435 — a silently dead path left the socket `connected` for up to ~45 s (engine.io ping timeout):
 * clock froze, own chat lost, no banner. SocketClient now probes with an acked `net:ping`; no ack in
 * time → close the engine so the SAME Manager reconnects (never a second socket, #145).
 * @jest-environment jsdom
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'socket-client.js'), 'utf8');

function setup() {
  const handlers = {};
  const pings = [];
  const engine = { close: jest.fn() };
  const sock = {
    connected: true,
    auth: {},
    on: jest.fn((e, cb) => { handlers[e] = cb; }),
    off: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    io: { on: jest.fn(), engine },
    timeout: jest.fn((ms) => ({ emit: (ev, data, cb) => pings.push({ ev, ms, data, cb }) })),
  };
  delete window.SocketClient;
  window.__gvnSharedClient = null;
  const ioCalls = [];
  window.io = (...a) => { ioCalls.push(a); return sock; };
  window.GvnSession = { hasBelievedSession: () => true, legacyToken: () => null };
  window.eval(SRC);
  const client = new window.SocketClient();
  return { sock, engine, pings, client, ioCalls, SC: window.SocketClient };
}
function setHidden(v) { Object.defineProperty(document, 'hidden', { configurable: true, get: () => v }); }

describe('#435 liveness probe', () => {
  beforeEach(() => { jest.useFakeTimers(); setHidden(false); });
  afterEach(() => { jest.useRealTimers(); setHidden(false); });

  test('detects a dead path within ~10 s (probe cadence + ack deadline)', () => {
    const { SC } = setup();
    expect(SC.LIVENESS_EVERY_MS + SC.LIVENESS_ACK_MS).toBeLessThanOrEqual(10000);
  });

  test('probes net:ping with an ack deadline while connected', () => {
    const { pings, SC } = setup();
    jest.advanceTimersByTime(SC.LIVENESS_EVERY_MS);
    expect(pings).toHaveLength(1);
    expect(pings[0].ev).toBe('net:ping');
    expect(pings[0].ms).toBe(SC.LIVENESS_ACK_MS);
    // server wrappedOn coerces a non-object first arg (a bare ack fn) to {} → must send a payload
    expect(pings[0].data).toEqual({});
  });

  test('ack received → engine stays open; next probe goes out', () => {
    const { pings, engine, SC } = setup();
    jest.advanceTimersByTime(SC.LIVENESS_EVERY_MS);
    pings[0].cb(null);
    jest.advanceTimersByTime(SC.LIVENESS_EVERY_MS);
    expect(engine.close).not.toHaveBeenCalled();
    expect(pings).toHaveLength(2);
  });

  test('no ack → engine closed (same Manager reconnects), no second io() call', () => {
    const { pings, engine, ioCalls, SC } = setup();
    jest.advanceTimersByTime(SC.LIVENESS_EVERY_MS);
    pings[0].cb(new Error('operation has timed out'));
    expect(engine.close).toHaveBeenCalledTimes(1);
    expect(ioCalls).toHaveLength(1);
  });

  test('only one probe in flight at a time', () => {
    const { pings, SC } = setup();
    jest.advanceTimersByTime(SC.LIVENESS_EVERY_MS * 3);
    expect(pings).toHaveLength(1);
  });

  test('ack error after the socket already disconnected → no extra close', () => {
    const { sock, pings, engine, SC } = setup();
    jest.advanceTimersByTime(SC.LIVENESS_EVERY_MS);
    sock.connected = false;
    pings[0].cb(new Error('socket has been disconnected'));
    expect(engine.close).not.toHaveBeenCalled();
  });

  test('ack error from an older engine (already replaced) → new engine untouched', () => {
    const { sock, pings, engine, SC } = setup();
    jest.advanceTimersByTime(SC.LIVENESS_EVERY_MS);
    const fresh = { close: jest.fn() };
    sock.io.engine = fresh;
    pings[0].cb(new Error('timeout'));
    expect(engine.close).not.toHaveBeenCalled();
    expect(fresh.close).not.toHaveBeenCalled();
  });

  test('disconnected or hidden tab → no probe', () => {
    const { sock, pings, SC } = setup();
    sock.connected = false;
    jest.advanceTimersByTime(SC.LIVENESS_EVERY_MS);
    sock.connected = true;
    setHidden(true);
    jest.advanceTimersByTime(SC.LIVENESS_EVERY_MS);
    expect(pings).toHaveLength(0);
  });

  test('tab becomes visible → probes at once', () => {
    const { pings } = setup();
    setHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(pings).toHaveLength(1);
  });

  test('destroy() stops probing', () => {
    const { client, pings, SC } = setup();
    client.destroy();
    jest.advanceTimersByTime(SC.LIVENESS_EVERY_MS * 2);
    expect(pings).toHaveLength(0);
  });
});
