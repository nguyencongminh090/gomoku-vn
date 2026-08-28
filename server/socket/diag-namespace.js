'use strict';

/**
 * diag-namespace.js — the `/diag` Socket.io namespace (TODO.md #168).
 *
 * An UNLISTED, UNAUTHENTICATED measurement endpoint. A maintainer sends the
 * URL directly to a player who reported timer trouble (#155 China, #165
 * USA+VPN); the player runs a ~60s probe on their real network and submits the
 * result. It is the sanctioned production-sample channel for #167 step 1.
 *
 * ISOLATION IS THE WHOLE DESIGN (user_story.md R1, instruction.md R3)
 * ------------------------------------------------------------------
 * `io.use(verifySocketToken)` in server/index.js binds to the MAIN namespace
 * only — a namespace obtained via `io.of('/diag')` does not inherit it. That
 * is deliberate here, and it means this file owns everything the main
 * namespace would otherwise have given it:
 *
 *   - It never reads `socket.user`. There is no user.
 *   - It never touches RoomManager, the `sessions` registry, the lobby, or
 *     `state.js` in any form. Nothing it does can be observed from a room.
 *   - It cannot lean on SocketHandler's flood middleware (also main-namespace
 *     only), so the per-IP run limiter below is not defence in depth — it is
 *     the only defence.
 *
 * Related trap, from the #147 investigation: socket.io's
 * `connectionStateRecovery` defaults to `skipMiddlewares: true` and would
 * bypass namespace middleware on recovered connections. It is NOT enabled in
 * this deployment (#147 was closed "won't do"), but if it ever is, every
 * guard here must be re-checked — none of them may live in an `nsp.use()`.
 *
 * NOT A CLOCK AUTHORITY (R2 / #167)
 * ---------------------------------
 * Nothing here feeds a timeout. `diag:pong` hands back server timestamps for
 * the client to *measure* with; the client's numbers are only ever recorded,
 * never trusted for a decision.
 *
 * Heartbeat: `diag:ping` is our own message type on a cadence the client
 * picks (~500ms). engine.io's `pingInterval`/`pingTimeout` are NOT touched —
 * tightening those is the #147/#152 trap.
 */

const logger = require('../utils/logger');
const config = require('../config');
const { clientInfoFromSocket } = require('../utils/geo');
const diagResults = require('../utils/diag-results');
const { DiagSession } = require('./diag-session');

const NAMESPACE = '/diag';

// ---------------------------------------------------------------------------
// Per-IP run limiter
// ---------------------------------------------------------------------------

/**
 * Sliding-window run counter, keyed by resolved client IP.
 *
 * Counted when a run STARTS, never when it is submitted (instruction.md
 * pitfall): charging on submit would let someone run the probe a hundred
 * times and simply never press send, which is exactly the load we are
 * limiting.
 */
class RunLimiter {
  constructor(limit = config.DIAG_RUNS_PER_IP, windowMs = config.DIAG_RUN_WINDOW_MS) {
    this.limit = limit;
    this.windowMs = windowMs;
    /** @type {Map<string, number[]>} ip -> start timestamps inside the window */
    this.hits = new Map();
  }

  _live(ip, now) {
    const cutoff = now - this.windowMs;
    const kept = (this.hits.get(ip) || []).filter((t) => t > cutoff);
    if (kept.length) this.hits.set(ip, kept);
    else this.hits.delete(ip);
    return kept;
  }

  /**
   * @returns {{allowed: boolean, remaining: number, retryAfterMs: number}}
   *   On refusal, `retryAfterMs` is until the OLDEST hit falls out of the
   *   window — that is when a slot actually frees up.
   */
  tryConsume(ip, now = Date.now()) {
    const live = this._live(ip, now);
    if (live.length >= this.limit) {
      const retryAfterMs = Math.max(0, live[0] + this.windowMs - now);
      return { allowed: false, remaining: 0, retryAfterMs };
    }
    live.push(now);
    this.hits.set(ip, live);
    return { allowed: true, remaining: this.limit - live.length, retryAfterMs: 0 };
  }

  /** Drop expired entries for every IP — keeps the map from growing forever. */
  sweep(now = Date.now()) {
    for (const ip of [...this.hits.keys()]) this._live(ip, now);
  }
}

// ---------------------------------------------------------------------------
// Namespace wiring
// ---------------------------------------------------------------------------

/**
 * Attach the `/diag` namespace.
 *
 * @param {import('socket.io').Server} io
 * @param {{limiter?: RunLimiter, createSession?: function}} [deps] test seam
 * @returns {import('socket.io').Namespace}
 */
function register(io, deps = {}) {
  const limiter = deps.limiter || new RunLimiter();
  const createSession = deps.createSession || ((opts) => new DiagSession(opts));
  const nsp = io.of(NAMESPACE);

  // Deliberately no nsp.use(...) — see the header. Auth, the room registry and
  // the main flood middleware are all absent by design, not by omission.

  const sweepTimer = setInterval(() => limiter.sweep(), config.DIAG_RUN_WINDOW_MS);
  if (sweepTimer.unref) sweepTimer.unref();

  nsp.on('connection', (socket) => {
    const { ip, geo } = clientInfoFromSocket(socket);
    const ua = String((socket.handshake && socket.handshake.headers &&
      socket.handshake.headers['user-agent']) || '');

    /**
     * This socket's single active run. One at a time (R5): a second
     * `diag:start` on the same socket is refused rather than silently
     * replacing the first, so a client bug cannot burn the IP's whole quota.
     * @type {null | {startedAt: number, pings: number, session: DiagSession}}
     */
    let run = null;

    /**
     * The one teardown path. Every exit — disconnect, timeout, game over,
     * error — funnels through here, because a DiagSession that is dropped
     * without `destroy()` leaves its TimerManager's 1s interval running for
     * the life of the process.
     */
    const endRun = (reason) => {
      if (!run) return;
      if (run.session) run.session.destroy();
      logger.info('[Diag] Run ended', { sid: socket.id, ip, geo, reason });
      run = null;
    };

    logger.info('[Diag] Connected', { sid: socket.id, ip, geo });

    // ── Start a run ────────────────────────────────────────────────────────
    socket.on('diag:start', (_payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      if (run) {
        reply({ error: 'A test is already running.', code: 'DIAG_RUN_ACTIVE' });
        return;
      }
      const verdict = limiter.tryConsume(ip);
      if (!verdict.allowed) {
        logger.info('[Diag] Run refused (limit)', {
          sid: socket.id, ip, geo, retry_after_ms: verdict.retryAfterMs,
        });
        reply({
          error: 'Too many tests from this connection. Please try again later.',
          code: 'DIAG_RATE_LIMITED',
          retryAfterMs: verdict.retryAfterMs,
        });
        return;
      }
      // A REAL GameEngine + TimerManager, one instance per run, registered
      // nowhere global (no RoomManager, no state.js timerMap) so nothing can
      // observe it from the authenticated app and nothing outlives this socket.
      const session = createSession({
        sessionId: socket.id,
        meta: { ip, geo },
        onTimerSync: (sync) => socket.emit('diag:timer', sync),
        onTimeout: (loserId) => {
          socket.emit('diag:ended', { reason: 'timeout', loserId });
          endRun('timeout');
        },
      });
      run = { startedAt: Date.now(), pings: 0, session };
      session.start();

      logger.info('[Diag] Run started', { sid: socket.id, ip, geo, remaining: verdict.remaining });
      reply({ ok: true, serverTime: Date.now(), game: session.serialize() });
    });

    // ── Solo board move ────────────────────────────────────────────────────
    //
    // The whole point of the run: the player's move goes into a real
    // TimerManager, the bot answers instantly so the clock hands back, and
    // the ack + the `diag:timer` that follows are what the client times.
    socket.on('diag:move', (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      // Stamp the arrival monotonically BEFORE any work, so spent_ms measures
      // the network and the player's think time, not our own handling.
      const recvNs = process.hrtime.bigint();

      if (!run || !run.session) {
        reply({ error: 'No test is running.', code: 'DIAG_NO_RUN' });
        return;
      }
      const x = payload && Number.isInteger(payload.x) ? payload.x : null;
      const y = payload && Number.isInteger(payload.y) ? payload.y : null;
      if (x === null || y === null) {
        reply({ error: 'Invalid move.', code: 'DIAG_BAD_MOVE' });
        return;
      }

      const res = run.session.playerMove(x, y, recvNs);
      reply(res);

      if (res.ok && res.status === 'finished') {
        socket.emit('diag:ended', { reason: 'game_over', result: res.result });
        endRun('game_over');
      }
    });

    // ── Transport probe ────────────────────────────────────────────────────
    //
    // Echoes the client's own sequence number and send-stamp back untouched
    // (the client owns the round-trip arithmetic — the server never sees its
    // clock), plus two server readings:
    //   serverTime   — wall clock, for the client's skew estimate
    //   serverMonoNs — monotonic, so consecutive probes can be spaced without
    //                  a wall-clock adjustment corrupting the interval
    socket.on('diag:ping', (payload) => {
      if (!run) return; // probes outside a started run are ignored, not counted
      run.pings++;
      const seq = payload && Number.isFinite(payload.seq) ? payload.seq : null;
      const clientTs = payload && Number.isFinite(payload.clientTs) ? payload.clientTs : null;
      socket.emit('diag:pong', {
        seq,
        clientTs,
        serverTime: Date.now(),
        serverMonoNs: String(process.hrtime.bigint()),
      });
    });

    // ── Submit ─────────────────────────────────────────────────────────────
    socket.on('diag:submit', (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};

      // Size first: refuse before any parsing work is done on it.
      let size = 0;
      try {
        size = Buffer.byteLength(JSON.stringify(payload || {}), 'utf8');
      } catch {
        reply({ error: 'Malformed result.', code: 'DIAG_BAD_PAYLOAD' });
        return;
      }
      if (size > config.DIAG_MAX_PAYLOAD_BYTES) {
        logger.warn('[Diag] Submission refused (size)', { sid: socket.id, ip, geo, bytes: size });
        reply({ error: 'Result too large.', code: 'DIAG_PAYLOAD_TOO_LARGE' });
        return;
      }

      // A submit without a start is accepted on purpose: the run is already
      // measured and its cost already paid at start, and refusing here would
      // throw away a real sample from someone whose socket reconnected
      // mid-run. The limiter is not bypassed by this — starting is what costs.
      try {
        const { id } = diagResults.recordResult(payload, { ip, geo, ua });
        reply({ ok: true, id });
      } catch (err) {
        logger.error('[Diag] Failed to persist result', {
          sid: socket.id, ip, geo, err: err.message,
        });
        reply({ error: 'Could not save the result.', code: 'DIAG_SAVE_FAILED' });
      }
    });

    socket.on('disconnect', (reason) => {
      endRun(`disconnect:${reason}`);
      logger.info('[Diag] Disconnected', { sid: socket.id, ip, geo, reason });
    });

    socket.on('error', (err) => {
      logger.error('[Diag] Socket error', { sid: socket.id, ip, err: err && err.message });
    });
  });

  logger.info('[Diag] Namespace registered', { path: NAMESPACE });
  return nsp;
}

module.exports = { register, RunLimiter, NAMESPACE };
