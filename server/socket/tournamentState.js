'use strict';

/**
 * tournamentState.js — Tournament-scheduling-adjacent shared state: the
 * per-pairing TimerManager map and the deadline-sweep interval.
 *
 * Deliberately separate from server/socket/state.js's roomId-keyed
 * `timerMap` — this is the concrete form of "session model kept separate
 * from casual games" (features/tournament/user_story.md's architectural
 * constraint): same TimerManager *class*, disjoint *map*, disjoint
 * *cleanup lifecycle*.
 *
 * Design answer (b) (see the Phase 1-6 plan / docs/instruction/B48-*.md):
 * no per-pairing setTimeout — a single setInterval sweep over a Map of only
 * currently-pending deadlines, mirroring RoomManager._idleCleanup(). A
 * pairing is only ever in `pendingDeadlines` while it's short of
 * `InProgress`; it's removed the instant it advances past that (or resolves
 * to a terminal state), so the sweep's cost scales with matches currently
 * mid-scheduling, not tournament history.
 */

const config = require('../config');
const logger = require('../utils/logger');

/** @type {Map<string, TimerManager>} pairingId -> TimerManager instance */
const tournamentTimerMap = new Map();

/** @type {Map<string, {tournamentId: string, deadline: number}>} pairingId -> deadline bookkeeping */
const pendingDeadlines = new Map();

/**
 * Callback invoked once per overdue pairing found by the sweep. Installed by
 * TournamentManager at startup (one-directional dependency: this module
 * never requires TournamentManager, avoiding a circular require).
 * @type {null | (pairingId: string, tournamentId: string) => void}
 */
let onDeadline = null;

/** @param {(pairingId: string, tournamentId: string) => void} fn */
function setDeadlineHandler(fn) {
  onDeadline = fn;
}

/** Register a pairing's deadline for the sweep to watch. `deadline` is an epoch-ms number. */
function trackDeadline(pairingId, tournamentId, deadline) {
  pendingDeadlines.set(pairingId, { tournamentId, deadline });
}

/** Stop watching a pairing's deadline — call the instant it leaves a pre-InProgress state. */
function untrackDeadline(pairingId) {
  pendingDeadlines.delete(pairingId);
}

function _sweep() {
  if (!onDeadline) return;
  const now = Date.now();
  for (const [pairingId, { tournamentId, deadline }] of pendingDeadlines) {
    if (now >= deadline) {
      onDeadline(pairingId, tournamentId);
    }
  }
}

// Late-bound through module.exports (not a direct `_sweep` reference) so
// that spying on the export (see tournamentDeadlineSweep.test.js, mirroring
// RoomManager's `this._idleCleanup()` pattern) actually intercepts what the
// interval calls.
const _sweepInterval = setInterval(() => module.exports._sweep(), config.TOURNAMENT_DEADLINE_SCAN_INTERVAL_MS);

/** For clean process/test exit — mirrors RoomManager.shutdown(). */
function shutdown() {
  clearInterval(_sweepInterval);
  for (const timer of tournamentTimerMap.values()) timer.destroy();
  tournamentTimerMap.clear();
  pendingDeadlines.clear();
}

logger.info('[tournamentState] Initialized');

module.exports = {
  tournamentTimerMap,
  pendingDeadlines,
  setDeadlineHandler,
  trackDeadline,
  untrackDeadline,
  _sweep,
  shutdown,
};
