'use strict';

/**
 * move-lag.test.js — regression guard for the TODO.md #167 measurement harness
 * (server/utils/move-lag.js).
 *
 * The harness must:
 *   - be completely inert unless LOG_MOVE_LAG is set (no map writes, no log
 *     lines, no engine.io listeners);
 *   - compute `spent_ms` from monotonic bigint marks, rejecting a missing or
 *     negative delta rather than logging garbage;
 *   - derive half-RTT from the server→client ping / client→server pong pair.
 */

const EventEmitter = require('events');

jest.mock('../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const logger = require('../utils/logger');

// Required after the mock so the harness picks up the mocked logger.
let moveLag;
function loadFresh(enabled) {
  jest.resetModules();
  jest.doMock('../utils/logger', () => logger);
  if (enabled) process.env.LOG_MOVE_LAG = 'true';
  else delete process.env.LOG_MOVE_LAG;
  moveLag = require('../utils/move-lag');
}

const savedEnv = process.env.LOG_MOVE_LAG;
afterAll(() => {
  if (savedEnv === undefined) delete process.env.LOG_MOVE_LAG;
  else process.env.LOG_MOVE_LAG = savedEnv;
});

beforeEach(() => {
  jest.clearAllMocks();
});

function fakeSocket(extra = {}) {
  return {
    handshake: { headers: {}, address: '203.0.113.9' },
    data: {},
    ...extra,
  };
}

// ── moveLagEnabled() ────────────────────────────────────────────────────────

describe('moveLagEnabled()', () => {
  test.each([
    ['true', true],
    ['TRUE', true],
    ['1', true],
    ['false', false],
    ['0', false],
    ['', false],
    [undefined, false],
    ['yes', false],
  ])('LOG_MOVE_LAG=%p → %p', (val, expected) => {
    jest.resetModules();
    if (val === undefined) delete process.env.LOG_MOVE_LAG;
    else process.env.LOG_MOVE_LAG = val;
    const m = require('../utils/move-lag');
    expect(m.moveLagEnabled()).toBe(expected);
  });
});

// ── spentMs() — pure delta math + boundaries ────────────────────────────────

describe('spentMs()', () => {
  beforeAll(() => loadFresh(true));

  test('normal: ~3s between turn start and move receipt', () => {
    const start = 1_000_000_000n;
    const recv = start + 3_000_000_000n; // +3s in ns
    expect(moveLag.spentMs(start, recv)).toBeCloseTo(3000, 5);
  });

  test('boundary: receipt exactly at turn start → 0', () => {
    expect(moveLag.spentMs(500n, 500n)).toBe(0);
    expect(moveLag.spentMs(500n, 501n)).toBeCloseTo(0.000001, 9);
  });

  test('missing turn-start mark → null', () => {
    expect(moveLag.spentMs(undefined, 1_000n)).toBeNull();
  });

  test('non-bigint arguments → null (never throws)', () => {
    expect(moveLag.spentMs(1000, 2000)).toBeNull();
    expect(moveLag.spentMs(null, null)).toBeNull();
  });

  test('negative delta (clock went backwards) → null, not a bogus negative', () => {
    expect(moveLag.spentMs(2_000_000_000n, 1_000_000_000n)).toBeNull();
  });
});

// ── markTurnStart() / clearRoom() gating ────────────────────────────────────

describe('markTurnStart() / clearRoom()', () => {
  test('disabled: markTurnStart writes nothing', () => {
    loadFresh(false);
    moveLag.markTurnStart('room-1');
    expect(moveLag._turnStarts.has('room-1')).toBe(false);
  });

  test('enabled: markTurnStart records a bigint, clearRoom removes it', () => {
    loadFresh(true);
    moveLag.markTurnStart('room-1');
    expect(typeof moveLag._turnStarts.get('room-1')).toBe('bigint');
    moveLag.clearRoom('room-1');
    expect(moveLag._turnStarts.has('room-1')).toBe(false);
  });

  test('enabled: no roomId → no write', () => {
    loadFresh(true);
    moveLag.markTurnStart(undefined);
    expect(moveLag._turnStarts.size).toBe(0);
  });
});

// ── logMove() ───────────────────────────────────────────────────────────────

describe('logMove()', () => {
  test('disabled: no log line even with a valid mark', () => {
    loadFresh(false);
    moveLag._turnStarts.set('room-1', 1n); // force a mark past the gate
    moveLag.logMove(fakeSocket(), {
      roomId: 'room-1', userId: 'u1', mode: 'per_game', recvNs: 2_000_000_000n,
    });
    expect(logger.info).not.toHaveBeenCalled();
  });

  test('enabled but no turn-start mark: no log line', () => {
    loadFresh(true);
    moveLag.logMove(fakeSocket(), {
      roomId: 'room-x', userId: 'u1', mode: 'per_game', recvNs: 2_000_000_000n,
    });
    expect(logger.info).not.toHaveBeenCalled();
  });

  test('enabled with a mark: emits one [MoveLag] line with spent_ms + null half_rtt_ms', () => {
    loadFresh(true);
    const start = 10_000_000_000n;
    moveLag._turnStarts.set('room-1', start);
    moveLag.logMove(fakeSocket(), {
      roomId: 'room-1', userId: 'u1', mode: 'per_game', recvNs: start + 4_500_000_000n,
    });
    expect(logger.info).toHaveBeenCalledTimes(1);
    const [tag, fields] = logger.info.mock.calls[0];
    expect(tag).toBe('[MoveLag]');
    expect(fields).toMatchObject({
      room: 'room-1',
      user: 'u1',
      mode: 'per_game',
      spent_ms: 4500,
      half_rtt_ms: null,
    });
  });

  test('enabled: half_rtt_ms is carried through from socket.data (rounded)', () => {
    loadFresh(true);
    const start = 1n;
    moveLag._turnStarts.set('room-1', start);
    const socket = fakeSocket();
    socket.data.moveLagHalfRttMs = 87.4;
    moveLag.logMove(socket, {
      roomId: 'room-1', userId: 'u1', mode: 'blitz', recvNs: start + 1_000_000_000n,
    });
    expect(logger.info.mock.calls[0][1].half_rtt_ms).toBe(87);
  });

  test('enabled: falls back to "-" mode when none supplied', () => {
    loadFresh(true);
    moveLag._turnStarts.set('room-1', 1n);
    moveLag.logMove(fakeSocket(), {
      roomId: 'room-1', userId: 'u1', mode: undefined, recvNs: 1_000_000_001n,
    });
    expect(logger.info.mock.calls[0][1].mode).toBe('-');
  });
});

// ── attachHalfRttProbe() ────────────────────────────────────────────────────

describe('attachHalfRttProbe()', () => {
  test('disabled: attaches no listeners', () => {
    loadFresh(false);
    const conn = new EventEmitter();
    moveLag.attachHalfRttProbe(fakeSocket({ conn }));
    expect(conn.listenerCount('packet')).toBe(0);
    expect(conn.listenerCount('packetCreate')).toBe(0);
  });

  test('missing socket.conn: no throw', () => {
    loadFresh(true);
    expect(() => moveLag.attachHalfRttProbe(fakeSocket())).not.toThrow();
  });

  test('enabled: ping→pong pair writes half of the elapsed RTT to socket.data', () => {
    loadFresh(true);
    const conn = new EventEmitter();
    const socket = fakeSocket({ conn });
    moveLag.attachHalfRttProbe(socket);

    conn.emit('packetCreate', { type: 'ping' });
    // Busy-wait a hair so hrtime actually advances.
    const t0 = process.hrtime.bigint();
    while (process.hrtime.bigint() - t0 < 2_000_000n) { /* ~2ms */ }
    conn.emit('packet', { type: 'pong' });

    expect(typeof socket.data.moveLagHalfRttMs).toBe('number');
    expect(socket.data.moveLagHalfRttMs).toBeGreaterThan(0);
    // half-RTT, so it must be under the full elapsed wall time.
    expect(socket.data.moveLagHalfRttMs).toBeLessThan(1000);
  });

  test('enabled: a stray pong with no preceding ping is ignored', () => {
    loadFresh(true);
    const conn = new EventEmitter();
    const socket = fakeSocket({ conn });
    moveLag.attachHalfRttProbe(socket);

    conn.emit('packet', { type: 'pong' });
    expect(socket.data.moveLagHalfRttMs).toBeUndefined();
  });

  test('enabled: non-heartbeat packets do not disturb the estimate', () => {
    loadFresh(true);
    const conn = new EventEmitter();
    const socket = fakeSocket({ conn });
    moveLag.attachHalfRttProbe(socket);

    conn.emit('packetCreate', { type: 'ping' });
    conn.emit('packet', { type: 'message', data: 'x' });
    expect(socket.data.moveLagHalfRttMs).toBeUndefined();
    conn.emit('packet', { type: 'pong' });
    expect(typeof socket.data.moveLagHalfRttMs).toBe('number');
  });
});
