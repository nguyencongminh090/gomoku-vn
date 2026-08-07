'use strict';

/**
 * TournamentHandler.js — Socket events for the tournament management domain
 * (create/register/start + the pairing-scheduling actions from
 * PairingLifecycle.js). Gameplay itself (moves, resign, timeouts once a
 * pairing is InProgress) is TournamentMatchHandler.js's job — kept separate
 * per the plan's "matches don't go through the room/game handlers" split.
 *
 * Events handled:
 *   tournament:subscribe / tournament:unsubscribe — join/leave the
 *     tournament-lobby room and receive the tournament list
 *   tournament:create / tournament:register / tournament:unregister / tournament:start
 *   tournament:cancel — organizer-only, any time before natural completion (TODO.md #59)
 *   tournament:get / tournament:leave_room — subscribe/unsubscribe to one
 *     tournament's live room (standings, pairings)
 *   tournament:report_time / tournament:confirm_time / tournament:dispute_time
 *   tournament:organizer_resolve / tournament:organizer_adjust
 *   tournament:request_reschedule / tournament:approve_reschedule / tournament:deny_reschedule
 *   tournament:ready — pairing check-in (Ready -> InProgress)
 *
 * init(io) wires TournamentManager's EventEmitter side (tournament_started,
 * tournament_completed, pairing_changed) to broadcasts — called ONCE at
 * server startup, mirroring SocketHandler.js's roomManager.on('room_destroyed', ...).
 * register(io, socket) wires the per-connection request/response events —
 * called once per connected socket, mirroring every other domain handler.
 */

const logger = require('../../utils/logger');
const tournamentManager = require('../../managers/tournament/TournamentManager');
// Lazy-require to mirror RoomHandler.js's getGameHandler() pattern — avoids
// a load-time circular require if TournamentMatchHandler.js ever needs to
// reach back into this module (it doesn't today, but the pattern is cheap
// insurance and matches the rest of the codebase's convention).
function getTournamentMatchHandler() { return require('./TournamentMatchHandler'); }

const TOURNAMENT_LIST_ROOM = 'tournament-lobby';

function tournamentRoom(tournamentId) {
  return `tournament:${tournamentId}`;
}

// ---------------------------------------------------------------------------
// Tournament-list diff+debounce broadcast — mirrors state.js's
// _diffLobbyRooms/broadcastLobbyUpdate exactly, kept local to this module
// since tournamentState.js must not require TournamentManager (see that
// file's header comment on the one-directional dependency).
// ---------------------------------------------------------------------------

const LIST_DEBOUNCE_MS = 300;
const _listUpdateTimers = new WeakMap();
const _listSnapshots = new WeakMap();

function _diffTournamentList(io) {
  const previous = _listSnapshots.get(io) || new Map();
  const next = new Map();
  const upserts = [];

  for (const entry of tournamentManager.listTournaments()) {
    const serialized = JSON.stringify(entry);
    next.set(entry.tournamentId, serialized);
    if (previous.get(entry.tournamentId) !== serialized) upserts.push(entry);
  }

  const removed = [];
  for (const tournamentId of previous.keys()) {
    if (!next.has(tournamentId)) removed.push(tournamentId);
  }

  _listSnapshots.set(io, next);
  return { upserts, removed };
}

function sendTournamentListSnapshot(io, socket) {
  const tournaments = tournamentManager.listTournaments();
  socket.emit('tournament:list', { tournaments });
  if (!_listSnapshots.has(io)) {
    const baseline = new Map();
    for (const entry of tournaments) baseline.set(entry.tournamentId, JSON.stringify(entry));
    _listSnapshots.set(io, baseline);
  }
}

function broadcastTournamentListUpdate(io) {
  if (_listUpdateTimers.has(io)) return;
  const timeout = setTimeout(() => {
    _listUpdateTimers.delete(io);
    const { upserts, removed } = _diffTournamentList(io);
    if (upserts.length === 0 && removed.length === 0) return;
    io.to(TOURNAMENT_LIST_ROOM).emit('tournament:list_patch', { upserts, removed });
  }, LIST_DEBOUNCE_MS);
  _listUpdateTimers.set(io, timeout);
}

// ---------------------------------------------------------------------------
// tournament:updated entries diff — serializeTournamentUpdate() includes the
// FULL entries array (every registered player) on every call, so before this
// a tournament with e.g. 30 registered players re-sent all 30 to the whole
// room on every single register/unregister. Diff entries the same way
// _diffRoomUsers (state.js) diffs a room's users: keyed per tournamentId
// (shared across the whole tournament room, mirroring _diffRoomUsers being
// keyed per roomId), only included when something in it actually changed.
// ---------------------------------------------------------------------------

const _tournamentEntrySnapshots = new Map(); // tournamentId -> Map<entryId, serialized-entry JSON>

function _diffTournamentEntries(tournamentId, entries) {
  const previous = _tournamentEntrySnapshots.get(tournamentId) || new Map();
  const next = new Map();
  const upserts = [];

  for (const entry of entries) {
    const serialized = JSON.stringify(entry);
    next.set(entry.entryId, serialized);
    if (previous.get(entry.entryId) !== serialized) upserts.push(entry);
  }

  const removed = [];
  for (const entryId of previous.keys()) {
    if (!next.has(entryId)) removed.push(entryId);
  }

  _tournamentEntrySnapshots.set(tournamentId, next);
  return { upserts, removed };
}

function broadcastTournamentDetail(io, tournament) {
  const full = tournamentManager.serializeTournamentUpdate(tournament);
  const { upserts, removed } = _diffTournamentEntries(tournament.tournamentId, full.entries || []);

  const payload = { ...full };
  delete payload.entries;
  if (upserts.length > 0 || removed.length > 0) payload.entries = { upserts, removed };

  io.to(tournamentRoom(tournament.tournamentId)).emit('tournament:updated', payload);
}

// ---------------------------------------------------------------------------
// Pairing-changed batching — 'pairing_changed' can fire several times back to
// back in the SAME synchronous pass (round-advance creating a whole new
// round's pairings, a deadline-sweep tick resolving several overdue pairings,
// Double Elimination bracket auto-sync cascading bye→bye), each for a
// different pairingId. Emitting one 'tournament:pairing_updated' per pairing
// meant N socket messages AND N full page re-renders on the client
// (tournament-detail.js calls renderAll() on every message) for what is, from
// a viewer's perspective, one state change. setImmediate (not a timed
// debounce) coalesces only pairings changed within the current synchronous
// burst — a single isolated user action (report/confirm/dispute/...) still
// flushes on the very next tick, so this adds no perceptible latency.
// ---------------------------------------------------------------------------

const _pairingPatchQueues = new Map(); // tournamentId -> Map<pairingId, serializedPairing>
const _pairingPatchTimers = new Map(); // tournamentId -> Immediate

function _queuePairingChanged(io, tournamentId, pairing) {
  let queue = _pairingPatchQueues.get(tournamentId);
  if (!queue) {
    queue = new Map();
    _pairingPatchQueues.set(tournamentId, queue);
  }
  queue.set(pairing.pairingId, pairing);

  if (_pairingPatchTimers.has(tournamentId)) return;
  const immediate = setImmediate(() => {
    _pairingPatchTimers.delete(tournamentId);
    const pending = _pairingPatchQueues.get(tournamentId);
    _pairingPatchQueues.delete(tournamentId);
    if (!pending || pending.size === 0) return;
    io.to(tournamentRoom(tournamentId)).emit('tournament:pairings_patch', {
      tournamentId,
      pairings: Array.from(pending.values()),
    });
  });
  _pairingPatchTimers.set(tournamentId, immediate);
}

// ---------------------------------------------------------------------------
// init — one-time wiring of TournamentManager's events to broadcasts
// ---------------------------------------------------------------------------

/**
 * @param {import('socket.io').Server} io
 */
function init(io) {
  tournamentManager.on('tournament_started', (tournamentId) => {
    const tournament = tournamentManager.getTournament(tournamentId);
    if (tournament) broadcastTournamentDetail(io, tournament);
    broadcastTournamentListUpdate(io);
  });

  tournamentManager.on('tournament_completed', (tournamentId) => {
    const tournament = tournamentManager.getTournament(tournamentId);
    if (tournament) broadcastTournamentDetail(io, tournament);
    broadcastTournamentListUpdate(io);
  });

  // Organizer cancel (TODO.md #59) — TournamentManager already flipped every
  // non-terminal pairing to 'Cancelled' and emitted 'pairing_changed' for
  // each (picked up by the listener below), so this only needs to: tear down
  // any live match's socket room/state (TournamentManager itself never
  // touches io — see TournamentMatchHandler.forceCancelMatch's doc comment),
  // then broadcast the tournament-level status change.
  tournamentManager.on('tournament_cancelled', ({ tournamentId, cancelledLivePairingIds }) => {
    for (const pairingId of cancelledLivePairingIds) {
      getTournamentMatchHandler().forceCancelMatch(io, tournamentId, pairingId);
    }
    const tournament = tournamentManager.getTournament(tournamentId);
    if (tournament) broadcastTournamentDetail(io, tournament);
    broadcastTournamentListUpdate(io);
  });

  // Covers every pairing mutation, whether it came from a socket action
  // below (report/confirm/organizer resolve/...) or an automatic one
  // (deadline sweep walkover/void-replay, Double Elimination bracket
  // auto-sync creating the next round's matches) — see TournamentManager's
  // _emitPairingChanged doc comment.
  tournamentManager.on('pairing_changed', ({ tournamentId, pairingId }) => {
    const pairing = tournamentManager.getPairing(pairingId);
    if (!pairing) return;
    _queuePairingChanged(io, tournamentId, tournamentManager.serializePairing(pairing));
  });

  // Both players just checked in (Ready -> InProgress, TournamentManager.
  // markPairingReady()) — this is what actually turns a pairing into a live
  // GameEngine. Without this listener a pairing sits at InProgress forever
  // with no match behind it, since TournamentManager itself never touches
  // io (see its class header) and nothing else calls startMatch().
  tournamentManager.on('pairing_ready', ({ tournamentId, pairingId }) => {
    getTournamentMatchHandler().startMatch(io, tournamentId, pairingId);
  });

  logger.info('[TournamentHandler] Initialized');
}

// ---------------------------------------------------------------------------
// register — per-connection event listeners
// ---------------------------------------------------------------------------

/**
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function register(io, socket) {
  const user = socket.user;

  socket.on('tournament:subscribe', () => {
    socket.join(TOURNAMENT_LIST_ROOM);
    sendTournamentListSnapshot(io, socket);
  });

  socket.on('tournament:unsubscribe', () => {
    socket.leave(TOURNAMENT_LIST_ROOM);
  });

  socket.on('tournament:create', (payload = {}) => {
    const result = tournamentManager.createTournament(
      { userId: user.userId, displayName: user.displayName, isGuest: user.isGuest },
      { name: payload.name, format: payload.format, ruleSet: payload.ruleSet }
    );

    if (result.error) {
      socket.emit('tournament:error', { message: result.error, code: result.code });
      return;
    }

    socket.join(tournamentRoom(result.tournament.tournamentId));
    socket.emit('tournament:created', tournamentManager.serializeTournament(result.tournament));
    broadcastTournamentListUpdate(io);
  });

  socket.on('tournament:register', (payload = {}) => {
    if (!payload.tournamentId) {
      socket.emit('tournament:error', { message: 'Thiếu mã giải đấu.', code: 'MISSING_TOURNAMENT_ID' });
      return;
    }

    const result = tournamentManager.registerPlayer(
      { userId: user.userId, displayName: user.displayName, isGuest: user.isGuest },
      payload.tournamentId
    );

    if (result.error) {
      socket.emit('tournament:error', { message: result.error, code: result.code });
      return;
    }

    socket.join(tournamentRoom(payload.tournamentId));
    socket.emit('tournament:registered', { tournamentId: payload.tournamentId, entryId: result.entryId });
    broadcastTournamentDetail(io, result.tournament);
    broadcastTournamentListUpdate(io);
  });

  socket.on('tournament:unregister', (payload = {}) => {
    if (!payload.tournamentId) {
      socket.emit('tournament:error', { message: 'Thiếu mã giải đấu.', code: 'MISSING_TOURNAMENT_ID' });
      return;
    }

    const result = tournamentManager.unregisterPlayer(user.userId, payload.tournamentId);

    if (result.error) {
      socket.emit('tournament:error', { message: result.error, code: result.code });
      return;
    }

    socket.emit('tournament:unregistered', { tournamentId: payload.tournamentId });
    socket.leave(tournamentRoom(payload.tournamentId));
    broadcastTournamentDetail(io, result.tournament);
    broadcastTournamentListUpdate(io);
  });

  socket.on('tournament:start', (payload = {}) => {
    if (!payload.tournamentId) {
      socket.emit('tournament:error', { message: 'Thiếu mã giải đấu.', code: 'MISSING_TOURNAMENT_ID' });
      return;
    }

    const result = tournamentManager.startTournament(user.userId, payload.tournamentId);
    if (result.error) {
      socket.emit('tournament:error', { message: result.error, code: result.code });
      return;
    }
    // tournament_started listener (init()) handles the broadcast.
  });

  socket.on('tournament:cancel', (payload = {}) => {
    if (!payload.tournamentId) {
      socket.emit('tournament:error', { message: 'Thiếu mã giải đấu.', code: 'MISSING_TOURNAMENT_ID' });
      return;
    }

    const result = tournamentManager.cancelTournament(user.userId, payload.tournamentId, payload.reason);
    if (result.error) {
      socket.emit('tournament:error', { message: result.error, code: result.code });
      return;
    }
    // tournament_cancelled listener (init()) handles the broadcast.
  });

  socket.on('tournament:get', (payload = {}) => {
    if (!payload.tournamentId) {
      socket.emit('tournament:error', { message: 'Thiếu mã giải đấu.', code: 'MISSING_TOURNAMENT_ID' });
      return;
    }

    const tournament = tournamentManager.getTournament(payload.tournamentId);
    if (!tournament) {
      socket.emit('tournament:error', { message: 'Giải đấu không tồn tại.', code: 'TOURNAMENT_NOT_FOUND' });
      return;
    }

    socket.join(tournamentRoom(payload.tournamentId));
    socket.emit('tournament:detail', {
      tournament: tournamentManager.serializeTournament(tournament),
      pairings: tournamentManager.listPairings(payload.tournamentId).map((p) => tournamentManager.serializePairing(p)),
    });
  });

  socket.on('tournament:leave_room', (payload = {}) => {
    if (payload.tournamentId) socket.leave(tournamentRoom(payload.tournamentId));
  });

  // ── Pairing-scheduling actions (PairingLifecycle, via TournamentManager) ──

  const pairingAction = (eventName, fn) => {
    socket.on(eventName, (payload = {}) => {
      if (!payload.tournamentId || !payload.pairingId) {
        socket.emit('tournament:error', { message: 'Thiếu thông tin cặp đấu.', code: 'MISSING_PAIRING_CONTEXT' });
        return;
      }
      const result = fn(payload);
      if (result.error) {
        socket.emit('tournament:error', { message: result.error, code: result.code });
      }
      // Success broadcasts go through the 'pairing_changed' listener in init().
    });
  };

  pairingAction('tournament:report_time', (p) =>
    tournamentManager.reportPairingTime(user.userId, p.tournamentId, p.pairingId, p.proposedTime));

  pairingAction('tournament:confirm_time', (p) =>
    tournamentManager.confirmPairingTime(user.userId, p.tournamentId, p.pairingId));

  pairingAction('tournament:dispute_time', (p) =>
    tournamentManager.disputePairingTime(user.userId, p.tournamentId, p.pairingId));

  pairingAction('tournament:organizer_resolve', (p) =>
    tournamentManager.organizerResolvePairing(user.userId, p.tournamentId, p.pairingId, p.finalTime));

  pairingAction('tournament:organizer_adjust', (p) =>
    tournamentManager.organizerAdjustPairing(user.userId, p.tournamentId, p.pairingId, p.reason));

  pairingAction('tournament:request_reschedule', (p) =>
    tournamentManager.requestPairingReschedule(user.userId, p.tournamentId, p.pairingId, p.newProposedTime));

  pairingAction('tournament:approve_reschedule', (p) =>
    tournamentManager.approvePairingReschedule(user.userId, p.tournamentId, p.pairingId));

  pairingAction('tournament:deny_reschedule', (p) =>
    tournamentManager.denyPairingReschedule(user.userId, p.tournamentId, p.pairingId));

  pairingAction('tournament:ready', (p) =>
    tournamentManager.markPairingReady(user.userId, p.tournamentId, p.pairingId));
}

module.exports = {
  init,
  register,
  broadcastTournamentListUpdate,
  broadcastTournamentDetail,
  tournamentRoom,
};
