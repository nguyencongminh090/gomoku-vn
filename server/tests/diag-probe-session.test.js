'use strict';

/**
 * diag-probe-session.test.js — the client-side sampling loop and its
 * accumulators (TODO.md #168 step 4).
 *
 * Pure arithmetic with every clock and timer injected, so it runs in the
 * Node-environment suite with no DOM and no network — same arrangement as
 * timer-sync-core.test.js.
 *
 * The parity block at the end is the one that matters most: if this page's
 * half-RTT stopped agreeing with the room's, every submitted diagnostic
 * would describe a clock nobody runs.
 */

const LatencyProbeSession = require('../../client/js/diag/latency-probe-session');
const DiagProbeSession = require('../../client/js/diag/diag-probe-session');
const TimerSyncCore = require('../../client/js/timer-sync-core');

// ---------------------------------------------------------------------------
// A controllable clock + timer, so a "60 second run" takes no real time.
// ---------------------------------------------------------------------------

function harness(opts = {}) {
  let wall = 1_700_000_000_000;
  let mono = 0;
  let tick = null;

  const session = new (opts.Class || LatencyProbeSession)({
    now: () => wall,
    mono: () => mono,
    setTimer: (fn) => { tick = fn; return 1; },
    clearTimer: () => { tick = null; },
    ...opts,
  });

  return {
    session,
    /** Advance both clocks together. */
    advance(ms) { wall += ms; mono += ms; },
    /** Advance only the wall clock — simulates skew/drift, not elapsed time. */
    skew(ms) { wall += ms; },
    fireTimer() { if (tick) tick(); },
    get wall() { return wall; },
    setMono(v) { mono = v; },
  };
}

/** A base subclass that records what it sent, since _send is abstract. */
class RecordingSession extends LatencyProbeSession {
  constructor(opts) { super(opts); this.sent = []; }
  _send(seq, clientTs) { this.sent.push({ seq, clientTs }); }
}

/** Answer probe `seq` after `rttMs`, optionally with a server clock reading. */
function echo(h, seq, rttMs, serverTime) {
  h.advance(rttMs);
  h.session.onEcho({ seq, serverTime });
}

// ---------------------------------------------------------------------------

describe('percentile — nearest-rank, never interpolated', () => {
  const { percentile } = LatencyProbeSession;

  test('picks a value the network actually produced', () => {
    const v = [10, 20, 30, 40];
    // Interpolation would invent 25 for p50; nearest-rank returns a real sample.
    expect(percentile(v, 50)).toBe(20);
    expect([10, 20, 30, 40]).toContain(percentile(v, 50));
  });

  test.each([
    ['p50 of 1..10', 50, 5],
    ['p90 of 1..10', 90, 9],
    ['p99 of 1..10', 99, 10],
    ['p100 of 1..10', 100, 10],
  ])('%s', (_label, p, expected) => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], p)).toBe(expected);
  });

  test('a single sample is every percentile', () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 99)).toBe(42);
  });

  test('an empty sample is null, not zero — "not measured" is not "0ms"', () => {
    expect(percentile([], 50)).toBeNull();
  });

  test('does not mutate the caller\'s array', () => {
    const v = [3, 1, 2];
    percentile(v, 50);
    expect(v).toEqual([3, 1, 2]);
  });

  test('unsorted input is handled', () => {
    expect(percentile([30, 10, 20], 50)).toBe(20);
  });
});

describe('jitter — mean absolute change between consecutive samples', () => {
  const { jitter } = LatencyProbeSession;

  test('a perfectly steady link has zero jitter', () => {
    expect(jitter([100, 100, 100, 100])).toBe(0);
  });

  test('alternating delays report the swing, not the spread', () => {
    // |110-100| + |100-110| + |110-100| = 30 over 3 gaps
    expect(jitter([100, 110, 100, 110])).toBe(10);
  });

  test('a steady ramp is jitter, because each step moves', () => {
    expect(jitter([100, 110, 120, 130])).toBe(10);
  });

  test.each([
    ['no samples', []],
    ['one sample', [100]],
  ])('%s cannot have jitter', (_label, v) => {
    expect(jitter(v)).toBeNull();
  });
});

describe('driftPerMinute — a clock that RUNS wrong vs one merely SET wrong', () => {
  const { driftPerMinute } = LatencyProbeSession;

  test('a constant offset has no drift', () => {
    const pts = [0, 1000, 2000, 3000].map((t) => ({ t, v: 500 }));
    expect(driftPerMinute(pts)).toBeCloseTo(0, 6);
  });

  test('a steadily growing offset reports ms gained per minute', () => {
    // +10ms every 10s = 60ms/min
    const pts = [0, 10000, 20000, 30000].map((t, i) => ({ t, v: i * 10 }));
    expect(driftPerMinute(pts)).toBeCloseTo(60, 6);
  });

  test('a shrinking offset drifts negative', () => {
    const pts = [0, 10000, 20000].map((t, i) => ({ t, v: -i * 10 }));
    expect(driftPerMinute(pts)).toBeCloseTo(-60, 6);
  });

  test.each([
    ['no points', []],
    ['one point', [{ t: 0, v: 1 }]],
  ])('%s is undeterminable', (_label, pts) => {
    expect(driftPerMinute(pts)).toBeNull();
  });

  test('every sample at the same instant is undeterminable, not Infinity', () => {
    expect(driftPerMinute([{ t: 5, v: 1 }, { t: 5, v: 9 }])).toBeNull();
  });
});

describe('the sampling loop', () => {
  test('_send is abstract — the base class refuses to be used directly', () => {
    const h = harness();
    expect(() => h.session.start()).toThrow(/must be implemented/);
  });

  test('sends one probe immediately, then one per interval', () => {
    const h = harness({ Class: RecordingSession, intervalMs: 500 });
    h.session.start();
    expect(h.session.sent).toHaveLength(1);
    h.fireTimer();
    h.fireTimer();
    expect(h.session.sent.map((s) => s.seq)).toEqual([0, 1, 2]);
  });

  test('stop() halts the loop and is idempotent', () => {
    const h = harness({ Class: RecordingSession });
    h.session.start();
    h.session.stop();
    h.fireTimer();
    expect(h.session.sent).toHaveLength(1);
    expect(() => h.session.stop()).not.toThrow();
    expect(h.session.running).toBe(false);
  });

  test('start() twice does not double the cadence', () => {
    const h = harness({ Class: RecordingSession });
    h.session.start();
    h.session.start();
    expect(h.session.sent).toHaveLength(1);
  });

  test('stops itself at the hard duration ceiling', () => {
    const h = harness({ Class: RecordingSession, maxDurationMs: 1000 });
    h.session.start();
    h.advance(1001);
    h.fireTimer();
    expect(h.session.running).toBe(false);
  });
});

describe('onEcho — folding replies back in', () => {
  test('records half the round-trip', () => {
    const h = harness({ Class: RecordingSession });
    h.session.start();
    echo(h, 0, 200);
    expect(h.session.halfRttSamples).toEqual([100]);
    expect(h.session.probesAnswered).toBe(1);
  });

  test('a duplicate echo is ignored, not counted twice', () => {
    // Double-counting would halve the apparent packet loss.
    const h = harness({ Class: RecordingSession });
    h.session.start();
    echo(h, 0, 200);
    h.session.onEcho({ seq: 0 });
    expect(h.session.probesAnswered).toBe(1);
  });

  test('an echo for a seq never sent is ignored', () => {
    const h = harness({ Class: RecordingSession });
    h.session.start();
    h.session.onEcho({ seq: 999 });
    expect(h.session.probesAnswered).toBe(0);
  });

  test.each([
    ['no payload', undefined],
    ['null', null],
    ['no seq', {}],
    ['a non-numeric seq', { seq: 'x' }],
    ['NaN', { seq: NaN }],
  ])('%s is ignored without throwing', (_label, payload) => {
    const h = harness({ Class: RecordingSession });
    h.session.start();
    expect(() => h.session.onEcho(payload)).not.toThrow();
    expect(h.session.probesAnswered).toBe(0);
  });

  test('a late reply arriving after stop() is still a real measurement', () => {
    const h = harness({ Class: RecordingSession });
    h.session.start();
    h.session.stop();
    echo(h, 0, 300);
    expect(h.session.halfRttSamples).toEqual([150]);
  });

  test('round-trip is timed on the MONOTONIC clock, not the wall clock', () => {
    // A wall-clock jump mid-flight (NTP correction, laptop wake) must not
    // register as a 60-second round trip.
    const h = harness({ Class: RecordingSession });
    h.session.start();
    h.advance(100);
    h.skew(-60000);
    h.session.onEcho({ seq: 0 });
    expect(h.session.halfRttSamples).toEqual([50]);
  });
});

describe('clock offset and its transit correction', () => {
  test('a perfectly synced server with latency still reports ~0 offset', () => {
    // The reply spent half the round trip in flight, so the raw reading is
    // behind by that much. Without the correction, distance alone would look
    // like a broken clock and the "clock accuracy" verdict would punish it.
    const h = harness({ Class: RecordingSession });
    h.session.start();
    const serverTimeAtSend = h.wall + 100; // server stamps mid-flight
    h.advance(200);
    h.session.onEcho({ seq: 0, serverTime: serverTimeAtSend });
    expect(h.session.offsetSamples[0]).toBeCloseTo(0, 6);
  });

  test('a genuinely fast client clock reports a negative offset', () => {
    const h = harness({ Class: RecordingSession });
    h.session.start();
    const serverTime = h.wall + 100 - 500; // server is 500ms behind us
    h.advance(200);
    h.session.onEcho({ seq: 0, serverTime });
    expect(h.session.offsetSamples[0]).toBeCloseTo(-500, 6);
  });

  test('an echo without serverTime contributes no offset point', () => {
    const h = harness({ Class: RecordingSession });
    h.session.start();
    echo(h, 0, 100);
    expect(h.session.offsetSamples).toHaveLength(0);
    expect(h.session.halfRttSamples).toHaveLength(1);
  });
});

describe('packetLossPct — only probes that can be called lost', () => {
  test('nothing answered yet is not 100% loss', () => {
    const h = harness({ Class: RecordingSession });
    h.session.start();
    h.fireTimer();
    expect(h.session.packetLossPct()).toBeNull();
  });

  test('a clean run reports zero', () => {
    const h = harness({ Class: RecordingSession });
    h.session.start();
    for (let i = 0; i < 5; i++) { echo(h, i, 100); h.fireTimer(); }
    expect(h.session.packetLossPct()).toBe(0);
  });

  test('a gap below the highest answered seq counts as lost', () => {
    const h = harness({ Class: RecordingSession });
    h.session.start();
    h.fireTimer(); h.fireTimer(); h.fireTimer(); // seq 0..3 sent
    echo(h, 0, 100);
    echo(h, 2, 100);
    echo(h, 3, 100);
    // seq 1 is below the highest seen (3) and never came back → 1 of 4.
    expect(h.session.packetLossPct()).toBe(25);
  });

  test('probes still legitimately in flight are NOT counted as lost', () => {
    // Otherwise every run would report a loss spike at the end simply
    // because the last probe had not been answered yet.
    const h = harness({ Class: RecordingSession });
    h.session.start();
    h.fireTimer(); h.fireTimer();
    echo(h, 0, 100);
    // seq 1 and 2 are above the highest seen (0) — still outstanding.
    expect(h.session.packetLossPct()).toBe(0);
  });

  test('a run that sent nothing has no loss figure', () => {
    const h = harness({ Class: RecordingSession });
    expect(h.session.packetLossPct()).toBeNull();
  });
});

describe('stop conditions — BOTH must be met', () => {
  const complete = (probes, moves) => {
    const h = harness({ Class: RecordingSession, minProbes: 3, minMoves: 2 });
    h.session.start();
    for (let i = 0; i < probes; i++) { echo(h, i, 100); h.fireTimer(); }
    for (let i = 0; i < moves; i++) h.session.recordMove();
    return h.session.isComplete();
  };

  test.each([
    ['enough probes, too few moves', 3, 1, false],
    ['too few probes, enough moves', 2, 2, false],
    ['both exactly at the minimum', 3, 2, true],
    ['both comfortably over', 5, 4, true],
    ['neither', 0, 0, false],
  ])('%s -> %s', (_label, probes, moves, expected) => {
    expect(complete(probes, moves)).toBe(expected);
  });

  test('the documented defaults are 30 probes and 8 moves', () => {
    expect(LatencyProbeSession.DEFAULT_MIN_PROBES).toBe(30);
    expect(LatencyProbeSession.DEFAULT_MIN_MOVES).toBe(8);
  });

  test('progress reports both counters so the UI can show a real bar', () => {
    const h = harness({ Class: RecordingSession, minProbes: 4, minMoves: 2 });
    h.session.start();
    echo(h, 0, 100);
    h.session.recordMove();
    expect(h.session.progress()).toMatchObject({
      probes: 1, minProbes: 4, moves: 1, minMoves: 2, complete: false,
    });
  });

  test('onProgress fires on echoes and on moves', () => {
    const onProgress = jest.fn();
    const h = harness({ Class: RecordingSession, onProgress });
    h.session.start();
    echo(h, 0, 100);
    h.session.recordMove();
    expect(onProgress).toHaveBeenCalledTimes(2);
  });
});

describe('board-side measurements', () => {
  test.each([
    ['recordInputPaint', 'inputPaintSamples'],
    ['recordMoveConfirm', 'moveConfirmSamples'],
    ['recordTimerHandoff', 'timerHandoffSamples'],
    ['recordSpentFloor', 'spentFloorSamples'],
  ])('%s accepts a finite non-negative value', (method, bag) => {
    const h = harness({ Class: RecordingSession });
    h.session[method](12.5);
    expect(h.session[bag]).toEqual([12.5]);
  });

  test.each([
    ['NaN', NaN], ['Infinity', Infinity], ['a negative', -1],
    ['a string', '10'], ['undefined', undefined], ['null', null],
  ])('%s is refused rather than poisoning a percentile', (_label, value) => {
    const h = harness({ Class: RecordingSession });
    h.session.recordTimerHandoff(value);
    expect(h.session.timerHandoffSamples).toHaveLength(0);
  });

  test('zero is a legitimate measurement', () => {
    const h = harness({ Class: RecordingSession });
    h.session.recordInputPaint(0);
    expect(h.session.inputPaintSamples).toEqual([0]);
  });
});

describe('stats() — the submitted run bag', () => {
  test('matches the documented shape', () => {
    const h = harness({ Class: RecordingSession });
    h.session.start();
    for (let i = 0; i < 4; i++) { echo(h, i, 100 + i * 10, h.wall); h.fireTimer(); }
    h.session.recordMove();
    h.session.recordInputPaint(8);
    h.session.recordMoveConfirm(120);
    h.session.recordTimerHandoff(180);
    h.session.recordSpentFloor(30);
    h.session.stop();

    const s = h.session.stats();
    expect(s).toHaveProperty('durationMs');
    expect(s.transportSamples).toBe(4);
    expect(s.boardMoves).toBe(1);
    expect(s.halfRttMs).toEqual(expect.objectContaining({
      p50: expect.any(Number), p90: expect.any(Number), p99: expect.any(Number),
      min: expect.any(Number), max: expect.any(Number),
    }));
    expect(s.clockOffsetMs).toHaveProperty('driftMsPerMin');
    expect(s.inputPaintMs.p50).toBe(8);
    expect(s.timerHandoffMs.p50).toBe(180);
  });

  test('omits series that were never measured, rather than sending nulls', () => {
    const h = harness({ Class: RecordingSession });
    h.session.start();
    const s = h.session.stats();
    expect(s).not.toHaveProperty('halfRttMs');
    expect(s).not.toHaveProperty('timerHandoffMs');
    expect(s).not.toHaveProperty('clockOffsetMs');
    expect(s.transportSamples).toBe(0);
  });

  test('survives the server\'s sanitizer intact', () => {
    // End-to-end shape check: what the client builds is what the server keeps.
    const h = harness({ Class: RecordingSession });
    h.session.start();
    for (let i = 0; i < 3; i++) { echo(h, i, 100, h.wall); h.fireTimer(); }
    h.session.recordMove();
    h.session.recordTimerHandoff(180);
    h.session.stop();

    const { sanitizeRun } = require('../utils/diag-results');
    const kept = sanitizeRun(h.session.stats());
    expect(kept.transportSamples).toBe(3);
    expect(kept.boardMoves).toBe(1);
    expect(kept.timerHandoffMs.p50).toBe(180);
    expect(kept.halfRttMs.p50).toBe(50);
  });
});

describe('parity with the room clock (the whole point of this page)', () => {
  test('the rolling estimate is the ROOM\'s EMA, not a private average', () => {
    const h = harness({ Class: RecordingSession });
    h.session.start();

    const rtts = [200, 600, 400, 1000];
    let expected = 0;
    for (let i = 0; i < rtts.length; i++) {
      echo(h, i, rtts[i]);
      h.fireTimer();
      expected = TimerSyncCore.halfRttEma(expected, rtts[i]);
    }
    expect(h.session.halfRttEmaMs).toBe(expected);
  });

  test('an absurd round trip is rejected by the core, leaving the estimate put', () => {
    const h = harness({ Class: RecordingSession });
    h.session.start();
    echo(h, 0, 200);
    const settled = h.session.halfRttEmaMs;
    h.fireTimer();
    echo(h, 1, 45000); // beyond the core's 30s stall ceiling
    expect(h.session.halfRttEmaMs).toBe(settled);
    // ...but it is still a real transport sample for the percentiles.
    expect(h.session.halfRttSamples).toHaveLength(2);
  });

  test('the offset uses the core, so both pages agree on what skew means', () => {
    const h = harness({ Class: RecordingSession });
    h.session.start();
    const serverTime = h.wall + 1234;
    h.advance(0);
    h.session.onEcho({ seq: 0, serverTime });
    expect(h.session.offsetSamples[0])
      .toBeCloseTo(TimerSyncCore.clockOffsetMs(serverTime, h.wall), 6);
  });
});

describe('DiagProbeSession — the diag:ping/diag:pong binding', () => {
  function fakeSocket() {
    const listeners = new Map();
    return {
      emitted: [],
      emit(ev, p) { this.emitted.push({ ev, p }); },
      on(ev, fn) { listeners.set(ev, fn); },
      _fire(ev, p) { const fn = listeners.get(ev); if (fn) fn(p); },
      _count(ev) { return listeners.has(ev) ? 1 : 0; },
      listeners,
    };
  }

  test('requires a socket', () => {
    expect(() => new DiagProbeSession({})).toThrow(/requires a socket/);
  });

  test('emits diag:ping with the sequence and a client stamp', () => {
    const socket = fakeSocket();
    const h = harness({ Class: DiagProbeSession, socket });
    h.session.start();
    expect(socket.emitted[0].ev).toBe('diag:ping');
    expect(socket.emitted[0].p.seq).toBe(0);
    expect(typeof socket.emitted[0].p.clientTs).toBe('number');
  });

  test('a diag:pong feeds the accumulator', () => {
    const socket = fakeSocket();
    const h = harness({ Class: DiagProbeSession, socket });
    h.session.start();
    h.advance(150);
    socket._fire('diag:pong', { seq: 0, serverTime: h.wall });
    expect(h.session.probesAnswered).toBe(1);
    expect(h.session.halfRttSamples).toEqual([75]);
  });

  test('bind() is idempotent — a second listener would double-count echoes', () => {
    const socket = fakeSocket();
    const h = harness({ Class: DiagProbeSession, socket });
    h.session.bind();
    h.session.bind();
    h.session.start();
    h.advance(100);
    socket._fire('diag:pong', { seq: 0, serverTime: h.wall });
    expect(h.session.probesAnswered).toBe(1);
  });

  test('inherits every accumulator from the base rather than redefining it', () => {
    const socket = fakeSocket();
    const h = harness({ Class: DiagProbeSession, socket });
    expect(h.session).toBeInstanceOf(LatencyProbeSession);
    // hasOwnProperty, not toHaveProperty: the latter walks the prototype
    // chain and would find the inherited method, asserting nothing.
    const own = (m) => Object.prototype.hasOwnProperty.call(DiagProbeSession.prototype, m);
    for (const m of ['isComplete', 'stats', 'packetLossPct', 'recordMove', 'onEcho']) {
      expect(own(m)).toBe(false);
      expect(typeof h.session[m]).toBe('function');
    }
    // The subclass owns only the transport binding.
    expect(Object.getOwnPropertyNames(DiagProbeSession.prototype).sort())
      .toEqual(['_send', 'bind', 'constructor', 'start']);
  });
});
