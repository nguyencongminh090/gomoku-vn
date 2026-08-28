'use strict';

/**
 * move-lag.js — TEMPORARY measurement harness for TODO.md #167 (khảo sát).
 *
 * Off by default. Enable with `LOG_MOVE_LAG=true` (or `1`) in the environment.
 *
 * Per accepted `game:move`, logs one `[MoveLag]` line with:
 *   - `spent_ms`   — wall time the mover's clock actually ran on the server,
 *                    measured from a MONOTONIC turn-start mark
 *                    (`process.hrtime.bigint`), not `Date.now()`. Includes the
 *                    player's think time plus the upload transit of the move.
 *   - `half_rtt_ms`— server-measured half round-trip time of that socket, timed
 *                    from the engine.io `ping` the server sends to the `pong`
 *                    the client returns. No client cooperation, no new packet
 *                    type — contrast #165, where the client could NOT read this
 *                    because in protocol v4 the client never initiates the
 *                    heartbeat.
 *
 * The point of the sample: decide whether the time a high-latency player loses
 * is transit-delay drift (whole seconds — already handled for *display* by
 * #165's client-side compensation) or real round-trip cost (tens–hundreds of
 * ms). Only the latter would justify the bounded server-side refund sketched in
 * `docs/todo/B167-*.md` step 2.
 *
 * This module writes NO timer state and changes NO game logic. `clientTs`
 * cross-check is deliberately out of scope for step 1 (it would touch client JS
 * and force a repo-wide `?v=N` bump for a throwaway probe). Delete this file and
 * its call sites in `GameHandler.js` once #167's measurement is done.
 */

const logger = require('./logger');
const { clientInfoFromSocket } = require('./geo');

/** roomId -> bigint monotonic ns when the active player's clock last (re)started. */
const turnStarts = new Map();

function moveLagEnabled() {
  const v = String(process.env.LOG_MOVE_LAG || '').toLowerCase();
  return v === 'true' || v === '1';
}

/**
 * Attach a server-side half-RTT probe to a socket's underlying engine.io
 * connection. No-op unless the harness is enabled.
 *
 * @param {import('socket.io').Socket} socket
 */
function attachHalfRttProbe(socket) {
  if (!moveLagEnabled() || !socket || !socket.conn) return;

  let pingSentNs = 0n;
  socket.conn.on('packetCreate', (packet) => {
    if (packet && packet.type === 'ping') pingSentNs = process.hrtime.bigint();
  });
  socket.conn.on('packet', (packet) => {
    if (packet && packet.type === 'pong' && pingSentNs) {
      const rttMs = Number(process.hrtime.bigint() - pingSentNs) / 1e6;
      if (socket.data) socket.data.moveLagHalfRttMs = rttMs / 2;
      pingSentNs = 0n;
    }
  });
}

/**
 * Record "the active player's clock started now" for a room. Call after every
 * turn switch and at game start. No-op unless the harness is enabled.
 *
 * @param {string} roomId
 */
function markTurnStart(roomId) {
  if (!moveLagEnabled() || !roomId) return;
  turnStarts.set(roomId, process.hrtime.bigint());
}

/** Drop a room's turn-start mark (call on game end / room cleanup). */
function clearRoom(roomId) {
  turnStarts.delete(roomId);
}

/**
 * @param {bigint|undefined} turnStartNs — from the room's `markTurnStart`, or
 *   undefined if the clock started before the harness was enabled
 * @param {bigint} recvNs — monotonic time the `game:move` packet was received
 * @returns {number|null} ms the mover's clock ran on the server, or null if
 *   there is no usable turn-start mark (or the delta came out negative)
 */
function spentMs(turnStartNs, recvNs) {
  if (typeof turnStartNs !== 'bigint' || typeof recvNs !== 'bigint') return null;
  const ms = Number(recvNs - turnStartNs) / 1e6;
  return ms >= 0 ? ms : null;
}

/**
 * Emit one measurement line for an accepted move. Pure aside from the log call;
 * silently does nothing when the harness is off or there is no turn-start mark.
 *
 * @param {import('socket.io').Socket} socket
 * @param {{roomId:string, userId:string, mode:string, recvNs:bigint,
 *          clientHalfRttMs?:number}} ctx — `clientHalfRttMs` is the mover's own
 *          rolling half-RTT estimate (from #165), carried purely for
 *          cross-check against the server's engine.io ping/pong reading;
 *          never an input to any timeout calculation
 */
function logMove(socket, { roomId, userId, mode, recvNs, clientHalfRttMs }) {
  if (!moveLagEnabled()) return;
  const spent = spentMs(turnStarts.get(roomId), recvNs);
  if (spent === null) return;

  // `undefined` (not null) so the logger omits the key entirely rather than
  // emitting a bare `half_rtt_ms=` — the engine.io ping/pong only yields a
  // reading once per pingInterval (~25s), so on a short game most moves have
  // no server-measured RTT yet. An absent key parses more cleanly than an
  // empty value when tallying coverage.
  const half = socket && socket.data && typeof socket.data.moveLagHalfRttMs === 'number'
    ? Math.round(socket.data.moveLagHalfRttMs)
    : undefined;
  const info = socket ? clientInfoFromSocket(socket) : { ip: '-', geo: '-' };

  // Client-reported, so sanitize hard: a finite non-negative number in a sane
  // range, else drop it. This value is logged for comparison only.
  const clientHalf = typeof clientHalfRttMs === 'number'
    && Number.isFinite(clientHalfRttMs)
    && clientHalfRttMs >= 0
    && clientHalfRttMs <= 60000
    ? Math.round(clientHalfRttMs)
    : undefined;

  logger.info('[MoveLag]', {
    room: roomId,
    user: userId,
    mode: mode || '-',
    spent_ms: Math.round(spent),
    half_rtt_ms: half,
    client_half_rtt_ms: clientHalf,
    ip: info.ip,
    geo: info.geo,
  });
}

module.exports = {
  moveLagEnabled,
  attachHalfRttProbe,
  markTurnStart,
  clearRoom,
  spentMs,
  logMove,
  // test hook — not for production use
  _turnStarts: turnStarts,
};
