'use strict';

/**
 * latency-probe-session.js — abstract sampling loop for the diagnostic page
 * (TODO.md #168 step 4).
 *
 * Owns everything that is transport-agnostic: the probe cadence, the
 * percentile accumulators, sequence-gap loss detection, the clock-offset
 * drift fit, and the stop condition. A subclass supplies only how a probe
 * goes out and how an echo comes back:
 *
 *     class DiagProbeSession extends LatencyProbeSession {
 *       _send(seq, clientTs) { ... }   // put one probe on the wire
 *     }
 *     // ...and calls this.onEcho(payload) when the answer arrives.
 *
 * WHY A BASE CLASS FOR ONE SUBCLASS
 * ---------------------------------
 * planning.md's code-organization answer: a future `RoomProbeSession` would
 * measure the SAME quantities inside a real ranked room, where the transport
 * is the room's own socket rather than `diag:ping`. Keeping the arithmetic
 * here means that second implementation cannot quietly disagree with this one
 * about what "p90 half-RTT" means. The seam is left; the subclass is not
 * built now (out of scope, user_story.md).
 *
 * HALF-RTT PARITY (the point of the whole page)
 * ---------------------------------------------
 * The rolling estimate uses `TimerSyncCore.halfRttEma` — the very function
 * the room's clock runs on (#165, extracted in step 1). If this page computed
 * its own average, the number a reporter sends us would describe a clock
 * nobody runs. The percentiles are reported alongside it because an EMA alone
 * hides the tail, and the tail is what #167 needs.
 *
 * NOT A CLOCK AUTHORITY (R2/#167): everything here is measurement for a human
 * to read. No value computed in this file feeds any timeout.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../timer-sync-core'));
  } else {
    root.LatencyProbeSession = factory(root.TimerSyncCore);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (TimerSyncCore) {

  /** Default cadence. Fast enough for ~30 samples in under a minute. */
  const DEFAULT_INTERVAL_MS = 500;
  /** Stop conditions (planning.md): enough transport samples AND enough moves. */
  const DEFAULT_MIN_PROBES = 30;
  const DEFAULT_MIN_MOVES = 8;
  /** Hard ceiling so a wedged run cannot probe forever. */
  const DEFAULT_MAX_DURATION_MS = 120000;

  /**
   * Nearest-rank percentile over an unsorted numeric array.
   *
   * Nearest-rank rather than interpolation on purpose: with ~30-60 samples,
   * interpolating invents a value between two real measurements, and every
   * number this page reports should be one the network actually produced.
   *
   * @param {number[]} values
   * @param {number} p 0-100
   * @returns {number|null} null for an empty sample
   */
  function percentile(values, p) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const rank = Math.ceil((p / 100) * sorted.length);
    return sorted[Math.min(Math.max(rank, 1), sorted.length) - 1];
  }

  /**
   * Mean absolute difference between consecutive samples.
   *
   * This is jitter in the sense that matters to a player: how much the delay
   * moves from one packet to the next. Standard deviation would describe the
   * spread around the mean, which a steadily-degrading link can hide.
   */
  function jitter(values) {
    if (values.length < 2) return null;
    let total = 0;
    for (let i = 1; i < values.length; i++) total += Math.abs(values[i] - values[i - 1]);
    return total / (values.length - 1);
  }

  /** Summary bag for one series of measurements. */
  function summarize(values) {
    if (!values.length) return null;
    return {
      p50: percentile(values, 50),
      p90: percentile(values, 90),
      p99: percentile(values, 99),
      min: Math.min(...values),
      max: Math.max(...values),
      jitter: jitter(values),
    };
  }

  /**
   * Least-squares slope of offset against time, expressed per minute.
   *
   * A constant offset is a clock that is merely SET wrong; a sloping one is a
   * clock that RUNS wrong, and only the second keeps pulling the player's
   * display away from the server over a game. Reporting them apart is what
   * lets #167 tell drift-sized loss from RTT-sized loss.
   *
   * @param {{t:number, v:number}[]} points
   * @returns {number|null} ms of offset gained per minute, null if undeterminable
   */
  function driftPerMinute(points) {
    if (points.length < 2) return null;
    const n = points.length;
    let sumT = 0, sumV = 0, sumTT = 0, sumTV = 0;
    for (const { t, v } of points) {
      sumT += t; sumV += v; sumTT += t * t; sumTV += t * v;
    }
    const denom = n * sumTT - sumT * sumT;
    if (denom === 0) return null; // every sample at the same instant
    const slopePerMs = (n * sumTV - sumT * sumV) / denom;
    return slopePerMs * 60000;
  }

  class LatencyProbeSession {
    /**
     * @param {object} opts
     * @param {number} [opts.intervalMs]
     * @param {number} [opts.minProbes]
     * @param {number} [opts.minMoves]
     * @param {number} [opts.maxDurationMs]
     * @param {function():number} [opts.now]      wall clock, injectable for tests
     * @param {function():number} [opts.mono]     monotonic clock (performance.now)
     * @param {function} [opts.setTimer]          setInterval, injectable
     * @param {function} [opts.clearTimer]        clearInterval, injectable
     * @param {function} [opts.onProgress]        (progress) => void
     */
    constructor(opts = {}) {
      this.intervalMs = opts.intervalMs || DEFAULT_INTERVAL_MS;
      this.minProbes = opts.minProbes != null ? opts.minProbes : DEFAULT_MIN_PROBES;
      this.minMoves = opts.minMoves != null ? opts.minMoves : DEFAULT_MIN_MOVES;
      this.maxDurationMs = opts.maxDurationMs || DEFAULT_MAX_DURATION_MS;

      this.now = opts.now || (() => Date.now());
      this.mono = opts.mono || (typeof performance !== 'undefined'
        ? () => performance.now()
        : () => Date.now());
      this.setTimer = opts.setTimer || ((fn, ms) => setInterval(fn, ms));
      this.clearTimer = opts.clearTimer || ((h) => clearInterval(h));
      this.onProgress = opts.onProgress || (() => {});

      this.reset();
    }

    reset() {
      this._handle = null;
      this._running = false;
      this._seq = 0;
      /** seq -> monotonic send time, for probes still unanswered. */
      this._inFlight = new Map();

      this.startedAt = null;
      this.endedAt = null;

      /** Half of each measured round-trip, in ms. */
      this.halfRttSamples = [];
      /** Rolling estimate, computed with the ROOM's own EMA (step 1). */
      this.halfRttEmaMs = 0;
      /** {t, v} offset points for the drift fit. */
      this.offsetPoints = [];
      this.offsetSamples = [];

      this.inputPaintSamples = [];
      this.moveConfirmSamples = [];
      this.timerHandoffSamples = [];
      this.spentFloorSamples = [];

      this.probesSent = 0;
      this.probesAnswered = 0;
      this.movesPlayed = 0;
      /** Highest sequence number ever echoed, for gap-based loss. */
      this._maxSeqSeen = -1;
    }

    // ── Subclass contract ───────────────────────────────────────────────────

    /**
     * Put one probe on the wire. Subclasses MUST implement.
     * @param {number} seq
     * @param {number} clientTs wall-clock stamp to echo back
     */
    // eslint-disable-next-line no-unused-vars
    _send(seq, clientTs) {
      throw new Error('LatencyProbeSession._send must be implemented by a subclass');
    }

    // ── Loop ────────────────────────────────────────────────────────────────

    start() {
      if (this._running) return;
      this._running = true;
      this.startedAt = this.now();
      this._probe();
      this._handle = this.setTimer(() => this._probe(), this.intervalMs);
    }

    stop() {
      if (!this._running) return;
      this._running = false;
      this.endedAt = this.now();
      if (this._handle !== null) this.clearTimer(this._handle);
      this._handle = null;
    }

    get running() { return this._running; }

    _probe() {
      if (!this._running) return;
      if (this.elapsedMs() >= this.maxDurationMs) { this.stop(); return; }
      const seq = this._seq++;
      this._inFlight.set(seq, this.mono());
      this.probesSent++;
      this._send(seq, this.now());
    }

    /**
     * Fold one echo back in. Safe to call for unknown/duplicate/late echoes —
     * a probe reply that arrives after the run stopped is still a real
     * measurement of the network and is counted.
     *
     * @param {{seq:number, serverTime:number}} payload
     */
    onEcho(payload) {
      if (!payload || !Number.isFinite(payload.seq)) return;
      const sentMono = this._inFlight.get(payload.seq);
      if (sentMono === undefined) return; // duplicate or never sent — ignore
      this._inFlight.delete(payload.seq);

      const rttMs = this.mono() - sentMono;
      const half = rttMs / 2;
      this.halfRttSamples.push(half);
      this.probesAnswered++;
      if (payload.seq > this._maxSeqSeen) this._maxSeqSeen = payload.seq;

      // Same EMA the room's clock runs on — see the header.
      const next = TimerSyncCore.halfRttEma(this.halfRttEmaMs, rttMs);
      if (next !== null) this.halfRttEmaMs = next;

      if (Number.isFinite(payload.serverTime)) {
        // The receive instant, corrected for the half-trip the reply spent in
        // flight: without that correction every offset would be biased by
        // latency and the "clock accuracy" verdict would punish distance.
        const recvTs = this.now();
        const offset = TimerSyncCore.clockOffsetMs(payload.serverTime, recvTs) + half;
        this.offsetSamples.push(offset);
        this.offsetPoints.push({ t: recvTs, v: offset });
      }

      this.onProgress(this.progress());
    }

    // ── Board-side measurements (fed by the page, not by the probe loop) ────

    /** pointerdown → optimistic stone painted. */
    recordInputPaint(ms) { if (Number.isFinite(ms) && ms >= 0) this.inputPaintSamples.push(ms); }
    /** click → server-confirmed move. */
    recordMoveConfirm(ms) { if (Number.isFinite(ms) && ms >= 0) this.moveConfirmSamples.push(ms); }
    /** move → server → bot → clock reading back. The #167 discriminator. */
    recordTimerHandoff(ms) { if (Number.isFinite(ms) && ms >= 0) this.timerHandoffSamples.push(ms); }
    /** Server-reported spent_ms floor for a near-zero-think move. */
    recordSpentFloor(ms) { if (Number.isFinite(ms) && ms >= 0) this.spentFloorSamples.push(ms); }

    /** One completed board move (player + bot reply). */
    recordMove() {
      this.movesPlayed++;
      this.onProgress(this.progress());
    }

    // ── Derived ─────────────────────────────────────────────────────────────

    elapsedMs() {
      if (this.startedAt === null) return 0;
      return (this.endedAt !== null ? this.endedAt : this.now()) - this.startedAt;
    }

    /**
     * Percentage of probes that never came back.
     *
     * Probes still legitimately in flight are excluded: counting them would
     * report a loss spike at the end of every run simply because the last
     * probe had not been answered yet. Only sequences BELOW the highest one
     * already echoed can be called lost — anything above it may still arrive.
     */
    packetLossPct() {
      if (this.probesSent === 0) return null;
      let lost = 0;
      for (const seq of this._inFlight.keys()) {
        if (seq < this._maxSeqSeen) lost++;
      }
      const accounted = this.probesAnswered + lost;
      if (accounted === 0) return null;
      return (lost / accounted) * 100;
    }

    /** Whether both stop conditions are met (planning.md: >=30 probes AND >=8 moves). */
    isComplete() {
      return this.probesAnswered >= this.minProbes && this.movesPlayed >= this.minMoves;
    }

    progress() {
      return {
        probes: this.probesAnswered,
        minProbes: this.minProbes,
        moves: this.movesPlayed,
        minMoves: this.minMoves,
        elapsedMs: this.elapsedMs(),
        complete: this.isComplete(),
        halfRttEmaMs: this.halfRttEmaMs,
      };
    }

    /**
     * The `run` bag submitted to the server, shaped exactly as
     * features/diagnostic-latency-page/planning.md documents it.
     */
    stats() {
      const offsetSummary = this.offsetSamples.length
        ? { p50: percentile(this.offsetSamples, 50), driftMsPerMin: driftPerMinute(this.offsetPoints) }
        : null;
      const out = {
        durationMs: this.elapsedMs(),
        transportSamples: this.probesAnswered,
        boardMoves: this.movesPlayed,
        packetLossPct: this.packetLossPct(),
        halfRttMs: summarize(this.halfRttSamples),
        clockOffsetMs: offsetSummary,
        inputPaintMs: summarize(this.inputPaintSamples),
        moveConfirmMs: summarize(this.moveConfirmSamples),
        timerHandoffMs: summarize(this.timerHandoffSamples),
        spentFloorMs: summarize(this.spentFloorSamples),
      };
      // Drop empty series rather than sending nulls — the server's sanitizer
      // omits non-finite values anyway, and an absent key reads as "not
      // measured" instead of "measured as nothing".
      for (const k of Object.keys(out)) {
        if (out[k] === null || out[k] === undefined) delete out[k];
      }
      return out;
    }
  }

  LatencyProbeSession.percentile = percentile;
  LatencyProbeSession.jitter = jitter;
  LatencyProbeSession.summarize = summarize;
  LatencyProbeSession.driftPerMinute = driftPerMinute;
  LatencyProbeSession.DEFAULT_INTERVAL_MS = DEFAULT_INTERVAL_MS;
  LatencyProbeSession.DEFAULT_MIN_PROBES = DEFAULT_MIN_PROBES;
  LatencyProbeSession.DEFAULT_MIN_MOVES = DEFAULT_MIN_MOVES;

  return LatencyProbeSession;
});
