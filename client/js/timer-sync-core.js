'use strict';

/**
 * timer-sync-core.js — The clock-synchronisation maths shared by the room and
 * the diagnostic page (TODO.md #168 step 1).
 *
 * Pure functions only: no DOM, no socket, no RoomState. UMD-wrapped like
 * escape-utils.js / profanity-filter.js, so the same file is `require()`-able
 * from Jest (no jsdom) and side-effect `import`-able in the browser, where it
 * attaches to `globalThis.TimerSyncCore`.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * These three expressions were written for the room (#165/#166) and lived
 * inline in `room-socket.js` (`transitDelaySec` / `tickLocal` /
 * `applyTimerSync`) and `game-ui.js` (`recordMoveRtt`). The diagnostic page
 * (#168) has to report the very quantities the room *acts* on — a second,
 * hand-copied implementation would drift from the room within one fix and
 * silently make every diagnostic report describe a clock nobody runs.
 *
 * This was an EXTRACTION, not a rewrite: every constant, every rounding step
 * and every clamp below is token-for-token what the room already ran, and
 * `timer-sync-conformance.test.js` fails if either room file grows a private
 * copy of an expression again.
 *
 * ONE DELIBERATE DIVERGENCE — `clockOffsetMs`
 * ------------------------------------------
 * The room previously computed the offset as
 *
 *     clockOffsetMs = (sync.serverTime || Date.now()) - Date.now();
 *
 * which reads the system clock TWICE. On the fallback path (a `timer:sync`
 * arriving without `serverTime`) the two readings are taken microseconds
 * apart, so the "no information, assume no skew" case could yield -1 instead
 * of exactly 0 — a spurious 1ms of skew, applied to every subsequent
 * `serverNow()` until the next sync corrected it. Taking a single reading and
 * passing it in for both halves makes that case exactly 0, and is otherwise
 * indistinguishable. Approved as part of #168 step 1; covered by the
 * "a missing server reading means no offset" case in the unit tests.
 *
 * WHAT THIS IS NOT (TODO.md #167 R2)
 * ----------------------------------
 * None of this ever decides a timeout. The server is the sole clock authority;
 * every value here is *display* compensation on the client, or — on the
 * diagnostic page — a number shown to a human. `clockOffsetMs` deliberately
 * keeps pure skew semantics (transit delay is NOT folded into it) so that
 * `serverNow()`-derived logic such as the room's turn watchdog is unaffected
 * by the display shave.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TimerSyncCore = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  /**
   * Round-trips longer than this are not latency, they are a stall (a
   * suspended tab, a laptop lid, a dead transport that recovered) — folding
   * one into the average would wipe the clock for the rest of the game.
   */
  const RTT_SAMPLE_MAX_MS = 30000;

  /**
   * Weight of the newest sample in the half-RTT moving average. 0.5 is
   * deliberately heavy: on a connection that genuinely degrades mid-game the
   * estimate has to follow within a couple of moves, and a single outlier is
   * already excluded by RTT_SAMPLE_MAX_MS above.
   */
  const EMA_ALPHA = 0.5;

  /**
   * Hard ceiling on how much of the displayed clock the transit compensation
   * may remove. Without it a pathological estimate could shave a visible chunk
   * off a player's own clock — the compensation is a courtesy, never a reason
   * to show someone less time than they might have.
   */
  const TRANSIT_CLAMP_MS = 8000;

  /**
   * Hysteresis half-width for the whole-second display shave (#169), in
   * seconds. A quarter of the room's 1000ms tick — the same "quarter tick"
   * unit `diag-report.js` bands jitter against, and derived the same way (from
   * the tick, not from any one measured sample).
   *
   * `displayShaveSec` rounds a fractional transit delay to whole seconds. On a
   * jittery link the half-RTT EMA oscillates across a .5s rounding point, so a
   * plain `Math.round` flipped the shave 0↔1 on every sync and the displayed
   * clock stuttered a whole second each move. With this dead zone the shave
   * only changes step once the estimate is `0.5 + this` past the current step.
   */
  const SHAVE_HYSTERESIS_SEC = 0.25;

  /**
   * Fold one measured move round-trip into the rolling half-RTT estimate.
   *
   * Half the RTT is the estimate of the one-way delay a `timer:sync` packet
   * spends in flight — the amount the displayed clock would otherwise run
   * behind the server.
   *
   * @param {number} prevHalfRttMs Previous estimate; 0/undefined = none yet.
   * @param {number} rttMs         Freshly measured full round-trip.
   * @returns {number|null} The new estimate, or `null` if the sample was
   *   rejected — the caller must then leave its stored estimate untouched.
   *   (`null` rather than "return prev" so a caller cannot accidentally turn a
   *   rejected sample into a write of the same value.)
   */
  function halfRttEma(prevHalfRttMs, rttMs) {
    if (!(rttMs >= 0) || rttMs > RTT_SAMPLE_MAX_MS) return null;
    const half = rttMs / 2;
    return prevHalfRttMs
      ? Math.round(prevHalfRttMs * (1 - EMA_ALPHA) + half * EMA_ALPHA)
      : Math.round(half);
  }

  /**
   * How much of the displayed clock to shave off for packet transit (#165).
   *
   * A one-way `timer:sync` took roughly this long to reach us, so the server
   * clock has already run that much further than the reading the packet
   * carried. Only ever subtracted from a *displayed* value.
   *
   * @param {number} halfRttMs Current estimate; falsy = no estimate yet.
   * @returns {number} Seconds (fractional).
   */
  function transitDelaySec(halfRttMs) {
    const halfRtt = halfRttMs || 0;
    return Math.min(halfRtt, TRANSIT_CLAMP_MS) / 1000;
  }

  /**
   * The active player's remaining whole seconds, transit-compensated.
   *
   * @param {number} deadlineMs   Server-clock ms at which the clock hits 0.
   * @param {number} serverNowMs  Our best estimate of the server's clock now.
   * @param {number} halfRttMs    Current half-RTT estimate.
   * @returns {number} Whole seconds, never negative.
   */
  function compensatedRemainingSec(deadlineMs, serverNowMs, halfRttMs) {
    return Math.max(0, Math.round((deadlineMs - serverNowMs) / 1000 - transitDelaySec(halfRttMs)));
  }

  /**
   * The whole-second shave applied to a freshly-synced opening value, so the
   * first paint after a sync already shows the compensated number instead of
   * flashing the uncompensated one for up to a second (#165).
   *
   * Pass `prevShaveSec` — the whole-second step this function last returned —
   * to engage the #169 hysteresis: the step then holds through a dead zone of
   * `0.5 + SHAVE_HYSTERESIS_SEC` either side of it, so a half-RTT EMA jittering
   * across a rounding point stops flipping the shave (and the clock) every
   * sync. Omit it (or pass a non-finite value) for the original plain round —
   * that single-argument form is byte-for-byte the pre-#168 expression and is
   * what the diagnostic page's room-parity checks still compare against.
   *
   * @param {number} halfRttMs    Current half-RTT estimate.
   * @param {number} [prevShaveSec] The step last shown; enables hysteresis.
   * @returns {number} Whole seconds to subtract from the active player's value.
   */
  function displayShaveSec(halfRttMs, prevShaveSec) {
    const target = transitDelaySec(halfRttMs);
    if (!Number.isFinite(prevShaveSec)) return Math.round(target);
    // Only re-round once the estimate is decisively into the next band;
    // otherwise keep showing the step we already committed to.
    if (Math.abs(target - prevShaveSec) > 0.5 + SHAVE_HYSTERESIS_SEC) {
      return Math.round(target);
    }
    return prevShaveSec;
  }

  /**
   * Clock skew between the server and this device: what to add to `Date.now()`
   * to read the server's clock.
   *
   * Note this is skew *plus one-way transit delay* — the packet carrying
   * `serverTimeMs` took time to arrive. That conflation is deliberate and must
   * stay: the room's watchdog maths is written against these semantics, and
   * the transit part is removed separately, at display time only, by
   * `transitDelaySec`. The diagnostic page reports the two apart by comparing
   * this against the measured half-RTT.
   *
   * @param {number} serverTimeMs Server clock reading carried by the packet.
   * @param {number} localNowMs   `Date.now()` at the moment of receipt.
   * @returns {number} Offset in ms (may be negative).
   */
  function clockOffsetMs(serverTimeMs, localNowMs) {
    return (serverTimeMs || localNowMs) - localNowMs;
  }

  return {
    RTT_SAMPLE_MAX_MS: RTT_SAMPLE_MAX_MS,
    EMA_ALPHA: EMA_ALPHA,
    TRANSIT_CLAMP_MS: TRANSIT_CLAMP_MS,
    SHAVE_HYSTERESIS_SEC: SHAVE_HYSTERESIS_SEC,
    halfRttEma: halfRttEma,
    transitDelaySec: transitDelaySec,
    compensatedRemainingSec: compensatedRemainingSec,
    displayShaveSec: displayShaveSec,
    clockOffsetMs: clockOffsetMs,
  };
});
