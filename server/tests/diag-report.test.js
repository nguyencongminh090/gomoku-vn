'use strict';

/**
 * diag-report.test.js — the verdict decision table (TODO.md #168 step 5).
 *
 * instruction.md asks specifically for `halfRttMs.p90 x {<t1, t1..t2, >t2}`
 * with boundary cases at exactly t1 and t2, because a threshold off-by-one is
 * invisible in production: nobody notices a player being told "slow" when
 * they should have been told "fine".
 *
 * The thresholds themselves are derived in diag-report.js's header from the
 * room clock's 1s tick granularity and the ~500ms RTT recorded for the
 * affected players in game-ui.js. These tests pin the BANDING, and read the
 * boundaries from the module rather than restating them, so a deliberate
 * re-derivation moves the tests with it while an accidental edit still fails
 * the boundary cases below.
 */

const DiagReport = require('../../client/js/diag/diag-report');

const T = DiagReport.THRESHOLDS;

/** Minimal run bag with one axis populated. */
const withHalfRtt = (over) => ({ halfRttMs: { p50: 10, p90: 10, p99: 10, jitter: 0, ...over } });

// ---------------------------------------------------------------------------

describe('band — inclusive of the worse side', () => {
  test.each([
    ['below yellow', 99, 'green'],
    ['exactly yellow', 100, 'yellow'],
    ['between', 150, 'yellow'],
    ['exactly red', 200, 'red'],
    ['above red', 500, 'red'],
  ])('%s', (_label, value, expected) => {
    expect(DiagReport.band(value, 100, 200)).toBe(expected);
  });

  test.each([
    ['NaN', NaN], ['Infinity', Infinity], ['a string', '150'],
    ['null', null], ['undefined', undefined],
  ])('%s is unmeasurable, not green', (_label, value) => {
    // "we could not measure this" must never render as "this is fine".
    expect(DiagReport.band(value, 100, 200)).toBeNull();
  });
});

describe('worst — severity wins across sub-signals', () => {
  test.each([
    [['green', 'green'], 'green'],
    [['green', 'yellow'], 'yellow'],
    [['yellow', 'red'], 'red'],
    [['green', 'red'], 'red'],
    [['green', null], 'green'],
    [[null, null], null],
  ])('%j -> %s', (input, expected) => {
    expect(DiagReport.worst(...input)).toBe(expected);
  });
});

describe('connection verdict — the decision table instruction.md asks for', () => {
  const verdict = (p90) => DiagReport.connectionVerdict(withHalfRtt({ p90 }));

  test.each([
    ['well below t1', 10, 'green'],
    ['just below t1', T.HALF_RTT_YELLOW_MS - 1, 'green'],
    ['exactly t1', T.HALF_RTT_YELLOW_MS, 'yellow'],
    ['between t1 and t2', (T.HALF_RTT_YELLOW_MS + T.HALF_RTT_RED_MS) / 2, 'yellow'],
    ['just below t2', T.HALF_RTT_RED_MS - 1, 'yellow'],
    ['exactly t2', T.HALF_RTT_RED_MS, 'red'],
    ['well above t2', T.HALF_RTT_RED_MS * 4, 'red'],
  ])('p90 %s -> %s', (_label, p90, expected) => {
    expect(verdict(p90)).toBe(expected);
  });

  test('judges the p90, not the median — the tail is what costs a player time', () => {
    // A fine median with an ugly tail must NOT read as green: #167 is about
    // the moments that lose someone their clock, and those live in the tail.
    expect(DiagReport.connectionVerdict(withHalfRtt({ p50: 20, p90: 900 }))).toBe('red');
    expect(DiagReport.connectionVerdict(withHalfRtt({ p50: 900, p90: 20 }))).toBe('green');
  });

  test('no transport samples at all yields no verdict', () => {
    expect(DiagReport.connectionVerdict({})).toBeNull();
    expect(DiagReport.connectionVerdict(null)).toBeNull();
  });

  test('the thresholds are the ones documented, not round guesses', () => {
    // Pinned so a casual "let's make it 300" has to change a test that says
    // where the number came from.
    expect(T.HALF_RTT_YELLOW_MS).toBe(250);
    expect(T.HALF_RTT_RED_MS).toBe(500);
  });
});

describe('clock verdict — offset magnitude and drift, worst wins', () => {
  const clock = (over) => DiagReport.clockVerdict({ clockOffsetMs: { p50: 0, driftMsPerMin: 0, ...over } });

  test.each([
    ['a tiny offset', { p50: 50 }, 'green'],
    ['exactly the yellow offset', { p50: T.OFFSET_YELLOW_MS }, 'yellow'],
    ['exactly the red offset', { p50: T.OFFSET_RED_MS }, 'red'],
  ])('%s -> %s', (_label, over, expected) => {
    expect(clock(over)).toBe(expected);
  });

  test('a NEGATIVE offset is judged on magnitude — fast and slow are equally wrong', () => {
    expect(clock({ p50: -T.OFFSET_RED_MS })).toBe('red');
    expect(clock({ p50: -50 })).toBe('green');
  });

  test('drift alone can carry the verdict even with a perfect offset', () => {
    // A clock that is SET right but RUNS wrong still pulls away over a game.
    expect(clock({ p50: 0, driftMsPerMin: T.DRIFT_RED_MS_PER_MIN })).toBe('red');
  });

  test('negative drift counts too', () => {
    expect(clock({ p50: 0, driftMsPerMin: -T.DRIFT_RED_MS_PER_MIN })).toBe('red');
  });

  test('an unmeasured drift does not drag a good offset down', () => {
    expect(clock({ p50: 10, driftMsPerMin: NaN })).toBe('green');
  });

  test('no offset series at all yields no verdict', () => {
    expect(DiagReport.clockVerdict({})).toBeNull();
  });
});

describe('stability verdict — loss and jitter, worst wins', () => {
  const stab = (run) => DiagReport.stabilityVerdict(run);

  test.each([
    ['no loss', 0, 'green'],
    ['just below the yellow band', T.LOSS_YELLOW_PCT - 0.1, 'green'],
    ['exactly the yellow band', T.LOSS_YELLOW_PCT, 'yellow'],
    ['exactly the red band', T.LOSS_RED_PCT, 'red'],
    ['catastrophic', 50, 'red'],
  ])('loss %s -> %s', (_label, packetLossPct, expected) => {
    expect(stab({ packetLossPct, halfRttMs: { jitter: 0 } })).toBe(expected);
  });

  test('jitter alone can carry the verdict with zero loss', () => {
    expect(stab({ packetLossPct: 0, halfRttMs: { jitter: T.JITTER_RED_MS } })).toBe('red');
  });

  test('the worse of loss and jitter wins', () => {
    expect(stab({ packetLossPct: 0, halfRttMs: { jitter: T.JITTER_YELLOW_MS } })).toBe('yellow');
    expect(stab({ packetLossPct: T.LOSS_RED_PCT, halfRttMs: { jitter: 0 } })).toBe('red');
  });

  test('an unmeasured loss figure does not read as zero loss', () => {
    expect(stab({ packetLossPct: null, halfRttMs: { jitter: 0 } })).toBe('green'); // jitter carries it
    expect(stab({ packetLossPct: null })).toBeNull(); // nothing measurable at all
  });
});

describe('verdicts() — the object stored in the JSONL', () => {
  test('omits an axis that was never measured rather than defaulting it', () => {
    const v = DiagReport.verdicts({ halfRttMs: { p90: 10, jitter: 0 }, packetLossPct: 0 });
    expect(v).toHaveProperty('connection');
    expect(v).toHaveProperty('stability');
    expect(v).not.toHaveProperty('clock');
  });

  test('an empty run yields an empty verdict object, not three greens', () => {
    expect(DiagReport.verdicts({})).toEqual({});
    expect(DiagReport.verdicts(null)).toEqual({});
  });

  test('its output survives the server\'s verdict sanitizer unchanged', () => {
    const { sanitizeVerdict } = require('../utils/diag-results');
    const v = DiagReport.verdicts({
      halfRttMs: { p90: 600, jitter: 10 },
      clockOffsetMs: { p50: 20, driftMsPerMin: 5 },
      packetLossPct: 0,
    });
    expect(sanitizeVerdict(v)).toEqual(v);
    expect(v.connection).toBe('red');
  });
});

describe('rows() — what the results screen renders', () => {
  test('always returns all three axes, in a stable order', () => {
    const rows = DiagReport.rows({});
    expect(rows.map((r) => r.id)).toEqual(['connection', 'clock', 'stability']);
  });

  test('an unmeasured axis gets a neutral icon and the unmeasured message', () => {
    const row = DiagReport.rows({})[0];
    expect(row.verdict).toBeNull();
    expect(row.icon).toBe(DiagReport.ICON_UNMEASURED);
    expect(row.messageKey).toBe('diag.verdict_unmeasured');
  });

  test('the message key encodes the verdict, so each colour is its own sentence', () => {
    const rows = DiagReport.rows({ halfRttMs: { p90: 600, jitter: 0 }, packetLossPct: 0 });
    const conn = rows.find((r) => r.id === 'connection');
    expect(conn.messageKey).toBe('diag.verdict_connection_red');
    expect(conn.icon).toBe(DiagReport.ICONS.red);
  });

  test('every verdict has a distinct icon', () => {
    const icons = Object.values(DiagReport.ICONS);
    expect(new Set(icons).size).toBe(icons.length);
  });
});

describe('details() — the collapsed technical block', () => {
  test('renders every figure with a unit', () => {
    const d = DiagReport.details({
      transportSamples: 44, boardMoves: 9,
      halfRttMs: { p50: 120.4, p90: 240, p99: 400, jitter: 30 },
      clockOffsetMs: { p50: -80, driftMsPerMin: 1.2 },
      packetLossPct: 2.54,
      timerHandoffMs: { p90: 610 },
    });
    const by = (k) => d.find((x) => x.labelKey === k).value;
    expect(by('diag.detail_samples')).toBe('44');
    expect(by('diag.detail_half_rtt_p50')).toBe('120 ms');
    expect(by('diag.detail_loss')).toBe('2.5 %');
    expect(by('diag.detail_offset')).toBe('-80 ms');
    expect(by('diag.detail_timer_handoff')).toBe('610 ms');
  });

  test('a missing measurement renders as an em dash, never NaN', () => {
    // The player may screenshot this; "NaN ms" would look like a broken page
    // rather than an unmeasured figure.
    const d = DiagReport.details({});
    expect(d.every((x) => x.value === '—')).toBe(true);
    expect(JSON.stringify(d)).not.toContain('NaN');
  });

  test('is safe on a null run', () => {
    expect(() => DiagReport.details(null)).not.toThrow();
  });
});
