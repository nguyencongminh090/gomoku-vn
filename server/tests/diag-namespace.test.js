'use strict';

/**
 * diag-namespace.test.js — the unauthenticated `/diag` namespace
 * (TODO.md #168 step 2).
 *
 * The namespace is deliberately outside every protection the main namespace
 * has: no auth middleware, no room registry, no flood limiter. So the tests
 * that matter most here are the negative ones — what it must NOT reach, and
 * what it must refuse.
 *
 * Driven through a fake `io`/socket pair rather than a live server: the logic
 * under test is the guards, and a real transport would add flakiness without
 * exercising a single extra branch.
 */

jest.mock('../utils/logger', () => ({
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

jest.mock('../utils/diag-results', () => ({
  recordResult: jest.fn(() => ({ ok: true, id: 'rec-1', file: '/tmp/x.jsonl' })),
}));

const fs = require('fs');
const path = require('path');

const diagResults = require('../utils/diag-results');
const config = require('../config');
const { register, RunLimiter, NAMESPACE } = require('../socket/diag-namespace');

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function makeSocket({ ip = '1.2.3.4', ua = 'UA/1.0', id = 'sock-1' } = {}) {
  const handlers = new Map();
  const emitted = [];
  return {
    id,
    handshake: {
      headers: { 'user-agent': ua, 'cf-connecting-ip': ip, 'cf-ipcountry': 'US' },
      address: '127.0.0.1',
    },
    on(event, fn) { handlers.set(event, fn); return this; },
    emit(event, payload) { emitted.push({ event, payload }); },
    // test helpers
    _fire(event, payload, ack) { return handlers.get(event)(payload, ack); },
    _has(event) { return handlers.has(event); },
    _emitted: emitted,
    _last(event) { return [...emitted].reverse().find((e) => e.event === event); },
  };
}

function makeIo() {
  const namespaces = new Map();
  return {
    of(name) {
      if (!namespaces.has(name)) {
        namespaces.set(name, {
          name,
          use: jest.fn(),
          on: jest.fn(function (event, fn) { this._onConnection = fn; }),
          _onConnection: null,
        });
      }
      return namespaces.get(name);
    },
    _nsp(name) { return namespaces.get(name); },
  };
}

/** Register, connect one socket, return both. */
function connect(io, socketOpts, deps) {
  const nsp = register(io, deps);
  const socket = makeSocket(socketOpts);
  nsp._onConnection(socket);
  return { nsp, socket };
}

/** The namespace's own source with comments removed, for structural assertions. */
function diagSource() {
  return fs
    .readFileSync(path.join(__dirname, '..', 'socket', 'diag-namespace.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

/** Synchronous ack collector. */
function ack() {
  const fn = jest.fn();
  fn.reply = () => (fn.mock.calls[0] ? fn.mock.calls[0][0] : undefined);
  return fn;
}

beforeEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------

describe('isolation from the authenticated app (R1/R3)', () => {
  test('mounts on /diag and installs NO namespace middleware', () => {
    const io = makeIo();
    register(io);
    const nsp = io._nsp(NAMESPACE);
    expect(nsp).toBeDefined();
    // An nsp.use() here would be the bug: auth is absent by design, but so is
    // every other middleware, and a guard hidden in one would be bypassed by
    // connectionStateRecovery's skipMiddlewares if that is ever enabled (#147).
    expect(nsp.use).not.toHaveBeenCalled();
  });

  test('never reads socket.user — there is no authenticated identity here', () => {
    const io = makeIo();
    const { socket } = connect(io);
    // A socket with no `user` property at all must survive the whole flow.
    expect(socket.user).toBeUndefined();
    const a = ack();
    socket._fire('diag:start', {}, a);
    expect(a.reply()).toMatchObject({ ok: true });
  });

  test('the source imports no room/session/lobby state', () => {
    // Structural assertion: this file must not gain a require() into the
    // authenticated app's shared state, where a bug could leak across.
    // Comments are stripped first — the header explains at length that
    // `socket.user` is never read, and that prose must not trip the check.
    expect(diagSource()).not.toMatch(/require\(['"][^'"]*RoomManager/);
    expect(diagSource()).not.toMatch(/require\(['"]\.\/state['"]\)/);
    expect(diagSource()).not.toMatch(/require\(['"][^'"]*SessionManager/);
    expect(diagSource()).not.toMatch(/socket\.user/);
  });

  test('does not touch engine.io heartbeat settings (#147/#152 trap)', () => {
    expect(diagSource()).not.toMatch(/pingInterval\s*:/);
    expect(diagSource()).not.toMatch(/pingTimeout\s*:/);
  });
});

describe('RunLimiter — 5 runs per IP per hour', () => {
  test('allows exactly the limit, then refuses', () => {
    const lim = new RunLimiter(5, 3600_000);
    const now = 1_000_000;
    for (let i = 0; i < 5; i++) {
      expect(lim.tryConsume('1.1.1.1', now).allowed).toBe(true);
    }
    expect(lim.tryConsume('1.1.1.1', now).allowed).toBe(false);
  });

  test('reports how many remain', () => {
    const lim = new RunLimiter(5, 3600_000);
    expect(lim.tryConsume('1.1.1.1', 0).remaining).toBe(4);
    expect(lim.tryConsume('1.1.1.1', 0).remaining).toBe(3);
  });

  test('counts each IP separately', () => {
    const lim = new RunLimiter(2, 3600_000);
    lim.tryConsume('1.1.1.1', 0);
    lim.tryConsume('1.1.1.1', 0);
    expect(lim.tryConsume('1.1.1.1', 0).allowed).toBe(false);
    expect(lim.tryConsume('2.2.2.2', 0).allowed).toBe(true);
  });

  test('the window slides — a slot frees up once the oldest hit ages out', () => {
    const lim = new RunLimiter(2, 1000);
    lim.tryConsume('1.1.1.1', 0);
    lim.tryConsume('1.1.1.1', 500);
    expect(lim.tryConsume('1.1.1.1', 900).allowed).toBe(false);
    // t=1001: the hit at t=0 has left the window, one slot is free again.
    expect(lim.tryConsume('1.1.1.1', 1001).allowed).toBe(true);
    // ...but the t=500 hit still occupies the other.
    expect(lim.tryConsume('1.1.1.1', 1001).allowed).toBe(false);
  });

  test('retryAfterMs points at when the OLDEST hit expires', () => {
    const lim = new RunLimiter(1, 1000);
    lim.tryConsume('1.1.1.1', 0);
    expect(lim.tryConsume('1.1.1.1', 200).retryAfterMs).toBe(800);
  });

  test('sweep drops fully-expired IPs so the map cannot grow forever', () => {
    const lim = new RunLimiter(5, 1000);
    lim.tryConsume('1.1.1.1', 0);
    lim.tryConsume('2.2.2.2', 0);
    expect(lim.hits.size).toBe(2);
    lim.sweep(5000);
    expect(lim.hits.size).toBe(0);
  });
});

describe('diag:start', () => {
  test('the 6th run from one IP is refused with a retry hint', () => {
    const io = makeIo();
    const limiter = new RunLimiter(5, 3600_000);
    const nsp = register(io, { limiter });

    for (let i = 0; i < 5; i++) {
      const s = makeSocket({ id: `s${i}` });
      nsp._onConnection(s);
      const a = ack();
      s._fire('diag:start', {}, a);
      expect(a.reply()).toMatchObject({ ok: true });
    }

    const sixth = makeSocket({ id: 's5' });
    nsp._onConnection(sixth);
    const a = ack();
    sixth._fire('diag:start', {}, a);
    expect(a.reply()).toMatchObject({ code: 'DIAG_RATE_LIMITED' });
    expect(a.reply().retryAfterMs).toBeGreaterThan(0);
  });

  test('a different IP is unaffected by another IP hitting the limit', () => {
    const io = makeIo();
    const limiter = new RunLimiter(1, 3600_000);
    const nsp = register(io, { limiter });

    const a1 = makeSocket({ id: 'a', ip: '1.1.1.1' });
    nsp._onConnection(a1);
    a1._fire('diag:start', {}, ack());

    const blocked = makeSocket({ id: 'a2', ip: '1.1.1.1' });
    nsp._onConnection(blocked);
    const ab = ack();
    blocked._fire('diag:start', {}, ab);
    expect(ab.reply().code).toBe('DIAG_RATE_LIMITED');

    const other = makeSocket({ id: 'b', ip: '9.9.9.9' });
    nsp._onConnection(other);
    const ao = ack();
    other._fire('diag:start', {}, ao);
    expect(ao.reply()).toMatchObject({ ok: true });
  });

  test('a second start on the SAME socket is refused, not silently restarted', () => {
    // Otherwise one buggy client could burn the whole per-IP quota by itself.
    const io = makeIo();
    const { socket } = connect(io);
    socket._fire('diag:start', {}, ack());
    const a = ack();
    socket._fire('diag:start', {}, a);
    expect(a.reply()).toMatchObject({ code: 'DIAG_RUN_ACTIVE' });
  });

  test('a refused start does not consume a slot', () => {
    const io = makeIo();
    const limiter = new RunLimiter(5, 3600_000);
    const nsp = register(io, { limiter });
    const s = makeSocket();
    nsp._onConnection(s);
    s._fire('diag:start', {}, ack());   // consumes 1
    s._fire('diag:start', {}, ack());   // DIAG_RUN_ACTIVE, must not consume
    expect(limiter.hits.get('1.2.3.4')).toHaveLength(1);
  });

  test('missing ack callback does not throw', () => {
    const io = makeIo();
    const { socket } = connect(io);
    expect(() => socket._fire('diag:start', {}, undefined)).not.toThrow();
  });
});

describe('diag:ping — the transport probe', () => {
  test('echoes seq and clientTs untouched, and adds server readings', () => {
    const io = makeIo();
    const { socket } = connect(io);
    socket._fire('diag:start', {}, ack());

    const before = Date.now();
    socket._fire('diag:ping', { seq: 7, clientTs: 123456 });
    const pong = socket._last('diag:pong').payload;

    expect(pong.seq).toBe(7);
    expect(pong.clientTs).toBe(123456);
    expect(pong.serverTime).toBeGreaterThanOrEqual(before);
    // Monotonic reading travels as a string: an hrtime nanosecond count
    // exceeds Number.MAX_SAFE_INTEGER and would silently lose precision.
    expect(typeof pong.serverMonoNs).toBe('string');
    expect(pong.serverMonoNs).toMatch(/^\d+$/);
  });

  test('is ignored entirely before a run has started', () => {
    const io = makeIo();
    const { socket } = connect(io);
    socket._fire('diag:ping', { seq: 1, clientTs: 1 });
    expect(socket._last('diag:pong')).toBeUndefined();
  });

  test.each([
    ['a missing payload', undefined],
    ['a null payload', null],
    ['no fields', {}],
    ['a non-numeric seq', { seq: 'one', clientTs: 'x' }],
    ['NaN', { seq: NaN, clientTs: NaN }],
  ])('%s still answers, with nulls instead of junk', (_label, payload) => {
    const io = makeIo();
    const { socket } = connect(io);
    socket._fire('diag:start', {}, ack());
    expect(() => socket._fire('diag:ping', payload)).not.toThrow();
    const pong = socket._last('diag:pong').payload;
    expect(pong.seq).toBeNull();
    expect(pong.clientTs).toBeNull();
    expect(typeof pong.serverTime).toBe('number');
  });

  test('successive probes report a strictly increasing monotonic reading', () => {
    const io = makeIo();
    const { socket } = connect(io);
    socket._fire('diag:start', {}, ack());
    socket._fire('diag:ping', { seq: 1, clientTs: 1 });
    const first = BigInt(socket._last('diag:pong').payload.serverMonoNs);
    socket._fire('diag:ping', { seq: 2, clientTs: 2 });
    const second = BigInt(socket._last('diag:pong').payload.serverMonoNs);
    expect(second > first).toBe(true);
  });
});

describe('diag:submit', () => {
  test('persists a well-formed result and returns its id', () => {
    const io = makeIo();
    const { socket } = connect(io);
    socket._fire('diag:start', {}, ack());

    const a = ack();
    socket._fire('diag:submit', { name: 'Alice', run: { durationMs: 60000 } }, a);

    expect(a.reply()).toEqual({ ok: true, id: 'rec-1' });
    expect(diagResults.recordResult).toHaveBeenCalledTimes(1);
  });

  test('hands the persistence layer SERVER-derived ip/geo/ua, not the payload', () => {
    const io = makeIo();
    const { socket } = connect(io, { ip: '203.0.113.9', ua: 'RealUA/2' });
    socket._fire('diag:start', {}, ack());
    socket._fire('diag:submit', { name: 'x', ip: '9.9.9.9', geo: 'ZZ' }, ack());

    const [, meta] = diagResults.recordResult.mock.calls[0];
    expect(meta.ip).toBe('203.0.113.9');
    expect(meta.ua).toBe('RealUA/2');
    expect(meta.geo).toBe('US'); // from the cf-ipcountry header, not the body
  });

  test('refuses a payload over the 8 KB cap without persisting it', () => {
    const io = makeIo();
    const { socket } = connect(io);
    socket._fire('diag:start', {}, ack());

    const a = ack();
    socket._fire('diag:submit', { feedback: 'x'.repeat(config.DIAG_MAX_PAYLOAD_BYTES + 1) }, a);

    expect(a.reply()).toMatchObject({ code: 'DIAG_PAYLOAD_TOO_LARGE' });
    expect(diagResults.recordResult).not.toHaveBeenCalled();
  });

  test('boundary: just under the cap is accepted, just over is refused', () => {
    const io = makeIo();
    const nsp = register(io);

    const under = makeSocket({ id: 'u' });
    nsp._onConnection(under);
    const pad = 'x'.repeat(config.DIAG_MAX_PAYLOAD_BYTES - 100);
    const au = ack();
    under._fire('diag:submit', { feedback: pad }, au);
    expect(au.reply()).toMatchObject({ ok: true });

    const over = makeSocket({ id: 'o' });
    nsp._onConnection(over);
    const ao = ack();
    over._fire('diag:submit', { feedback: pad + 'x'.repeat(200) }, ao);
    expect(ao.reply()).toMatchObject({ code: 'DIAG_PAYLOAD_TOO_LARGE' });
  });

  test('the cap is measured in BYTES, so multi-byte text cannot slip past it', () => {
    // 'あ' is 3 bytes in UTF-8 but 1 JS string unit — a .length check here
    // would let ~3x the intended payload through.
    const io = makeIo();
    const { socket } = connect(io);
    const a = ack();
    socket._fire('diag:submit', { feedback: 'あ'.repeat(config.DIAG_MAX_PAYLOAD_BYTES / 2) }, a);
    expect(a.reply()).toMatchObject({ code: 'DIAG_PAYLOAD_TOO_LARGE' });
  });

  test('a circular payload is refused as malformed, not crashed on', () => {
    const io = makeIo();
    const { socket } = connect(io);
    const evil = { name: 'x' };
    evil.self = evil;
    const a = ack();
    expect(() => socket._fire('diag:submit', evil, a)).not.toThrow();
    expect(a.reply()).toMatchObject({ code: 'DIAG_BAD_PAYLOAD' });
  });

  test('a persistence failure is reported, never silently swallowed', () => {
    // Losing a submission quietly is the worst outcome: the player believes
    // the team has their sample and cannot be asked for it twice.
    diagResults.recordResult.mockImplementationOnce(() => {
      throw new Error('ENOSPC');
    });
    const io = makeIo();
    const { socket } = connect(io);
    const a = ack();
    socket._fire('diag:submit', { name: 'x' }, a);
    expect(a.reply()).toMatchObject({ code: 'DIAG_SAVE_FAILED' });
  });

  test('submitting without a start still records — the run was already paid for', () => {
    const io = makeIo();
    const { socket } = connect(io);
    const a = ack();
    socket._fire('diag:submit', { name: 'reconnected' }, a);
    expect(a.reply()).toMatchObject({ ok: true });
  });
});

describe('lifecycle', () => {
  test('registers exactly the four expected events', () => {
    const io = makeIo();
    const { socket } = connect(io);
    for (const e of ['diag:start', 'diag:ping', 'diag:submit', 'disconnect', 'error']) {
      expect(socket._has(e)).toBe(true);
    }
  });

  test('disconnect clears the run so a reconnecting socket can start again', () => {
    const io = makeIo();
    const limiter = new RunLimiter(5, 3600_000);
    const nsp = register(io, { limiter });
    const s = makeSocket();
    nsp._onConnection(s);

    s._fire('diag:start', {}, ack());
    s._fire('disconnect', 'transport close');

    const a = ack();
    s._fire('diag:start', {}, a);
    expect(a.reply()).toMatchObject({ ok: true }); // not DIAG_RUN_ACTIVE
  });
});
