'use strict';

/**
 * diag-report.js — turns raw percentiles into plain-language verdicts
 * (TODO.md #168 step 5).
 *
 * The player is a non-technical person the maintainer sent a link to (R8).
 * They see an icon and a sentence; they never see a table of milliseconds.
 * This module is the whole translation layer between the two.
 *
 * WHERE THE THRESHOLDS COME FROM
 * ==============================
 * instruction.md is explicit that these must not be round numbers picked by
 * feel. They are derived from two things this repo already knows, and both
 * derivations are stated here so a future reader can challenge them:
 *
 * 1. THE ROOM CLOCK'S GRANULARITY. `room-socket.js` ticks the displayed
 *    clock once per 1000ms and renders whole seconds. A one-way delay below
 *    half a tick (500ms) can shift what the player sees by at most one
 *    second; above it, the display is guaranteed to disagree with the server
 *    by a visible second or more. That makes 500ms the point where latency
 *    stops being invisible — the RED boundary for connection.
 *
 * 2. THE MEASURED AFFECTED POPULATION. `game-ui.js`'s MOVE_ACK_TIMEOUT_MS
 *    comment records "~10x the ~0.5 s RTT measured for the affected players"
 *    (#152/#165) — the China/USA+VPN reporters this page exists for sit near
 *    500ms ROUND TRIP, i.e. ~250ms half-RTT. That is the boundary between
 *    "ordinary distance" and "the population that reported a bug" — the
 *    YELLOW boundary.
 *
 * Clock thresholds follow from (1) as well: the room counts whole seconds
 * against `serverNow()`, so an offset under one tick cannot change a
 * displayed second, and drift is judged against how much offset accumulates
 * over a typical game.
 *
 * STABILITY IS THE WEAKEST OF THE THREE. Packet-loss bands are conventional
 * (the same 1%/5% split interactive-realtime tooling generally uses) rather
 * than derived from anything measured here, because nothing in this repo has
 * ever measured loss. They are flagged as provisional on purpose: the first
 * real submissions this page collects are what should replace them, which is
 * the same "measure first" argument #167 is blocked on.
 *
 * Everything here is display-only (R2/#167): no verdict feeds any timeout.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DiagReport = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  /**
   * Half-RTT, in ms. See derivation (1) and (2) in the header.
   * green < 250 <= yellow < 500 <= red
   */
  const HALF_RTT_YELLOW_MS = 250;
  const HALF_RTT_RED_MS = 500;

  /**
   * Absolute clock offset, in ms. One room tick (1000ms) is the point at
   * which skew can change a displayed second; five ticks is where a player
   * would notice their clock disagreeing with the opponent's.
   */
  const OFFSET_YELLOW_MS = 1000;
  const OFFSET_RED_MS = 5000;

  /**
   * Offset gained per minute. A game runs a few minutes, so 250ms/min is
   * roughly "one visible second lost over a long game" and 1000ms/min is
   * "a second every minute" — the regime #165's compensation was built for.
   */
  const DRIFT_YELLOW_MS_PER_MIN = 250;
  const DRIFT_RED_MS_PER_MIN = 1000;

  /** Packet loss, percent. Provisional — see the header. */
  const LOSS_YELLOW_PCT = 1;
  const LOSS_RED_PCT = 5;

  /**
   * Jitter, in ms. Judged against the same 1s tick: swing beyond a quarter
   * tick makes the compensated display visibly unsteady.
   */
  const JITTER_YELLOW_MS = 100;
  const JITTER_RED_MS = 250;

  const GREEN = 'green';
  const YELLOW = 'yellow';
  const RED = 'red';

  /** Worst (most severe) of a set of verdicts; `null` entries are ignored. */
  function worst(...verdicts) {
    const present = verdicts.filter(Boolean);
    if (!present.length) return null;
    if (present.includes(RED)) return RED;
    if (present.includes(YELLOW)) return YELLOW;
    return GREEN;
  }

  /**
   * Band a value against two ascending thresholds.
   * Boundaries are INCLUSIVE of the worse band: exactly 250 is yellow,
   * exactly 500 is red. Stated explicitly because an off-by-one at a
   * threshold is invisible in production.
   */
  function band(value, yellowAt, redAt) {
    if (!Number.isFinite(value)) return null;
    if (value >= redAt) return RED;
    if (value >= yellowAt) return YELLOW;
    return GREEN;
  }

  /**
   * Connection quality, judged on the p90 half-RTT rather than the median.
   *
   * The median describes a good moment; #167 is about the moments that cost
   * a player their clock, and those live in the tail.
   */
  function connectionVerdict(run) {
    const half = run && run.halfRttMs;
    if (!half) return null;
    return band(half.p90, HALF_RTT_YELLOW_MS, HALF_RTT_RED_MS);
  }

  /** Clock accuracy: how far off, and whether it is getting worse. */
  function clockVerdict(run) {
    const off = run && run.clockOffsetMs;
    if (!off) return null;
    const magnitude = Number.isFinite(off.p50)
      ? band(Math.abs(off.p50), OFFSET_YELLOW_MS, OFFSET_RED_MS)
      : null;
    const drift = Number.isFinite(off.driftMsPerMin)
      ? band(Math.abs(off.driftMsPerMin), DRIFT_YELLOW_MS_PER_MIN, DRIFT_RED_MS_PER_MIN)
      : null;
    return worst(magnitude, drift);
  }

  /** Stability: dropped probes and how much the delay swings. */
  function stabilityVerdict(run) {
    if (!run) return null;
    const loss = band(run.packetLossPct, LOSS_YELLOW_PCT, LOSS_RED_PCT);
    const jit = run.halfRttMs && Number.isFinite(run.halfRttMs.jitter)
      ? band(run.halfRttMs.jitter, JITTER_YELLOW_MS, JITTER_RED_MS)
      : null;
    return worst(loss, jit);
  }

  /**
   * The three verdicts, shaped exactly as the JSONL's `verdict` object.
   * Axes with nothing measured are omitted rather than defaulted to green —
   * "we did not measure this" must never read as "this is fine".
   */
  function verdicts(run) {
    const out = {};
    const c = connectionVerdict(run);
    const k = clockVerdict(run);
    const s = stabilityVerdict(run);
    if (c) out.connection = c;
    if (k) out.clock = k;
    if (s) out.stability = s;
    return out;
  }

  /**
   * Phosphor sprite ids, one per verdict. The icon carries the meaning (R8),
   * so each verdict gets a DIFFERENT SHAPE, not the same glyph in three
   * colours — colour alone excludes colour-blind readers, and this page is
   * the one place a player is being told whether something is wrong.
   *
   * Constrained to ids that exist in `client/assets/icons/phosphor-sprite.svg`
   * (a curated 46-icon subset built in #129, not the full Phosphor set). A
   * `<use href>` pointing at a missing symbol renders NOTHING, with no
   * console error and no failing test — see diag-sprite-icons.test.js, which
   * exists because this bit me here.
   *
   *   check-circle     -> fine
   *   hourglass-medium -> slow (literally what a yellow connection is)
   *   warning          -> something is wrong
   *   magnifying-glass -> we could not measure it
   */
  const ICONS = {
    [GREEN]: 'ph-regular-check-circle',
    [YELLOW]: 'ph-bold-hourglass-medium',
    [RED]: 'ph-regular-warning',
  };
  const ICON_UNMEASURED = 'ph-regular-magnifying-glass';

  /**
   * Rows for the results screen: a stable id, the icon, and the i18n keys
   * for the label and the plain-language sentence.
   *
   * The sentence key encodes the verdict, so translators write three real
   * sentences per axis instead of one sentence plus an adjective — which is
   * what keeps the Vietnamese from reading like machine output.
   */
  function rows(run) {
    const v = verdicts(run);
    const axes = [
      { id: 'connection', labelKey: 'diag.axis_connection' },
      { id: 'clock', labelKey: 'diag.axis_clock' },
      { id: 'stability', labelKey: 'diag.axis_stability' },
    ];
    return axes.map((axis) => {
      const verdict = v[axis.id] || null;
      return {
        id: axis.id,
        verdict,
        icon: verdict ? ICONS[verdict] : ICON_UNMEASURED,
        labelKey: axis.labelKey,
        messageKey: verdict
          ? `diag.verdict_${axis.id}_${verdict}`
          : 'diag.verdict_unmeasured',
      };
    });
  }

  /**
   * The raw figures, for the collapsed details block.
   *
   * Returned as {labelKey, value} pairs already formatted, so the view does
   * no arithmetic and a missing measurement renders as an em dash rather
   * than "NaN ms" or a silently-absent row.
   */
  function details(run) {
    const ms = (n) => (Number.isFinite(n) ? `${Math.round(n)} ms` : '—');
    const pct = (n) => (Number.isFinite(n) ? `${Math.round(n * 10) / 10} %` : '—');
    const num = (n) => (Number.isFinite(n) ? String(Math.round(n)) : '—');
    const half = (run && run.halfRttMs) || {};
    const off = (run && run.clockOffsetMs) || {};
    const confirm = (run && run.moveConfirmMs) || {};
    const handoff = (run && run.timerHandoffMs) || {};
    const paint = (run && run.inputPaintMs) || {};

    return [
      { labelKey: 'diag.detail_samples', value: num(run && run.transportSamples) },
      { labelKey: 'diag.detail_moves', value: num(run && run.boardMoves) },
      { labelKey: 'diag.detail_half_rtt_p50', value: ms(half.p50) },
      { labelKey: 'diag.detail_half_rtt_p90', value: ms(half.p90) },
      { labelKey: 'diag.detail_half_rtt_p99', value: ms(half.p99) },
      { labelKey: 'diag.detail_jitter', value: ms(half.jitter) },
      { labelKey: 'diag.detail_loss', value: pct(run && run.packetLossPct) },
      { labelKey: 'diag.detail_offset', value: ms(off.p50) },
      { labelKey: 'diag.detail_drift', value: ms(off.driftMsPerMin) },
      { labelKey: 'diag.detail_input_paint', value: ms(paint.p50) },
      { labelKey: 'diag.detail_move_confirm', value: ms(confirm.p90) },
      { labelKey: 'diag.detail_timer_handoff', value: ms(handoff.p90) },
    ];
  }

  return {
    verdicts,
    connectionVerdict,
    clockVerdict,
    stabilityVerdict,
    rows,
    details,
    band,
    worst,
    ICONS,
    ICON_UNMEASURED,
    THRESHOLDS: {
      HALF_RTT_YELLOW_MS, HALF_RTT_RED_MS,
      OFFSET_YELLOW_MS, OFFSET_RED_MS,
      DRIFT_YELLOW_MS_PER_MIN, DRIFT_RED_MS_PER_MIN,
      LOSS_YELLOW_PCT, LOSS_RED_PCT,
      JITTER_YELLOW_MS, JITTER_RED_MS,
    },
  };
});
