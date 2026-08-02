'use strict';

/**
 * state.js — Shared Socket state & helpers.
 *
 * All mutable state that must be shared across domain handlers is held here.
 * Handlers import individual pieces; nothing is exported as a single bundle
 * to keep coupling explicit.
 */

const logger      = require('../utils/logger');
const roomManager = require('../managers/RoomManager');
const TimerManager = require('../managers/TimerManager');

// ---------------------------------------------------------------------------
// Shared state maps
// ---------------------------------------------------------------------------

/** Per-room timer storage: roomId → TimerManager instance */
const timerMap = new Map();

/** Per-player disconnect grace timers: userId → { timeout, countdown, roomId } */
const disconnectTimers = new Map();

/** Per-user empty-room grace timers: userId → { timeout, roomId } */
const emptyRoomGraceTimers = new Map();

/** Per-room ready-window timers (Start modal 30s countdown): roomId → Timeout */
const readyTimers = new Map();

/** How long seated players get to click Start before being vacated from their seat. */
const READY_WINDOW_MS = 30_000;

/**
 * Session registry: userId → live Socket.
 *
 * A "session" is exactly one authenticated Socket.io connection for a given
 * userId. The socket stored here for a userId IS that user's one active
 * session, by definition — this map is the single source of truth, not a
 * cache of ids that still needs a lookup elsewhere. Single-device-per-token
 * enforcement means a userId has at most one live socket, so no count is
 * needed and eviction is a plain Map.get/set (O(1), no scan of
 * io.sockets.sockets required).
 */
const sessions = new Map();

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/** Return a sorted array of online display names for lobby broadcast. */
function getOnlineUsersList() {
  return Array.from(sessions.values()).map(s => s.user.displayName).sort();
}

/**
 * How long to coalesce bursts of room mutations (sit/ready/start/resign/...)
 * into a single lobby broadcast. broadcastLobbyUpdate() is called from ~15
 * sites across the room lifecycle, and several of them fire back-to-back for
 * one user action.
 *
 * This window used to be the whole defence, and the verification pass showed
 * it failing at real player pace: actions ~1200ms apart each landed in their
 * own window, so a seat+ready+start+resign cycle still pushed 4 full-list
 * payloads. Now that each broadcast carries only what changed, the window size
 * stops being load-bearing — it just merges same-instant bursts.
 */
const LOBBY_UPDATE_DEBOUNCE_MS = 300;

/** Per-io pending debounce timer for broadcastLobbyUpdate(). */
const _lobbyUpdateTimers = new WeakMap();

/**
 * Per-io record of what lobby clients were last told: roomId → serialized
 * entry. Diffing against this at flush time is what makes the delta possible
 * without touching the ~15 call sites: they say "something changed", and the
 * flush works out what, by comparing against real state. A call site cannot
 * describe the change wrongly or forget to, because it never describes it.
 */
const _lobbySnapshots = new WeakMap();

/**
 * Compare the live room list against what lobby clients were last sent.
 * @returns {{ upserts: object[], removed: string[] }}
 */
function _diffLobbyRooms(io) {
  const previous = _lobbySnapshots.get(io) || new Map();
  const next = new Map();
  const upserts = [];

  for (const entry of roomManager.listRooms()) {
    const serialized = JSON.stringify(entry);
    next.set(entry.roomId, serialized);
    if (previous.get(entry.roomId) !== serialized) upserts.push(entry);
  }

  const removed = [];
  for (const roomId of previous.keys()) {
    if (!next.has(roomId)) removed.push(roomId);
  }

  _lobbySnapshots.set(io, next);
  return { upserts, removed };
}

/**
 * Send the full room list to one socket, and seed the delta baseline.
 *
 * A client joining mid-stream must receive a complete snapshot once before any
 * patch can mean anything — see LobbyHandler's `lobby:subscribe`.
 */
function sendLobbySnapshot(io, socket) {
  const rooms = roomManager.listRooms();
  socket.emit('lobby:update', { rooms });
  if (!_lobbySnapshots.has(io)) {
    const baseline = new Map();
    for (const entry of rooms) baseline.set(entry.roomId, JSON.stringify(entry));
    _lobbySnapshots.set(io, baseline);
  }
}

/**
 * Broadcast what changed in the room list to everyone in the lobby (debounced).
 *
 * Sends `lobby:patch` — `{ upserts, removed }` — instead of the whole list.
 * Both operations are idempotent by design: re-sending an entry a client
 * already has is a no-op, and removing a roomId it never had is a no-op. That
 * matters because a socket that subscribes between two flushes gets a snapshot
 * which may already include a change the next patch also carries.
 *
 * Emits nothing at all when nothing actually changed — the old code sent a
 * full list every time regardless.
 */
function broadcastLobbyUpdate(io) {
  if (_lobbyUpdateTimers.has(io)) return; // a broadcast is already scheduled for this burst
  const timeout = setTimeout(() => {
    _lobbyUpdateTimers.delete(io);
    const { upserts, removed } = _diffLobbyRooms(io);
    if (upserts.length === 0 && removed.length === 0) return;
    io.to('lobby').emit('lobby:patch', { upserts, removed });
  }, LOBBY_UPDATE_DEBOUNCE_MS);
  _lobbyUpdateTimers.set(io, timeout);
}

/**
 * Find all active Socket.io sockets belonging to a given userId.
 * @param {import('socket.io').Server} io
 * @param {string} userId
 * @param {string} [excludeSocketId] — skip this socket.id (e.g. the caller's own new connection)
 */
function findSocketsByUserId(io, userId, excludeSocketId = null) {
  const results = [];
  for (const [, s] of io.sockets.sockets) {
    if (s.id === excludeSocketId) continue;
    if (s.user && s.user.userId === userId) results.push(s);
  }
  return results;
}

/** Stop and destroy the TimerManager for a room, then remove it from the map. */
function cleanupRoomTimer(roomId) {
  const timer = timerMap.get(roomId);
  if (timer) {
    timer.destroy();
    timerMap.delete(roomId);
  }
}

/** Cancel the ready-window countdown (Start modal) for a room, if any. */
function cleanupReadyTimer(roomId) {
  const timeout = readyTimers.get(roomId);
  if (timeout) {
    clearTimeout(timeout);
    readyTimers.delete(roomId);
  }
}

/**
 * Reconcile the Start-modal ready-window against the room's current state.
 * Called after every mutation that can affect it (sit, stand, kick, leave,
 * settings change, confirmStart, game end). Centralized here (rather than in
 * RoomHandler) so GameHandler's rematch/handleGameEnd paths can reuse it
 * without a circular require.
 *
 * - Room playing, or fewer than 2 seated → cancel any pending window.
 * - Both seated, not all ready, no window running → start a fresh 30s window.
 * - Both seated and already all ready → nothing to do (caller starts the game).
 *
 * @param {import('socket.io').Server} io
 * @param {object} room
 */
function syncReadyWindow(io, room) {
  if (!room) return;

  if (room.state === 'playing' || !roomManager.bothSeated(room)) {
    cleanupReadyTimer(room.roomId);
    room.readyDeadline = null;
    return;
  }

  if (readyTimers.has(room.roomId)) return; // window already counting down

  room.readyDeadline = Date.now() + READY_WINDOW_MS;
  const timeout = setTimeout(() => handleReadyWindowTimeout(io, room.roomId), READY_WINDOW_MS);
  readyTimers.set(room.roomId, timeout);
}

/** Force-restart the ready window (used when settings change resets both players' ready state). */
function restartReadyWindow(io, room) {
  if (!room) return;
  cleanupReadyTimer(room.roomId);
  room.readyDeadline = null;
  syncReadyWindow(io, room);
}

/**
 * Ready-window deadline reached: vacate the seat of whichever seated player(s)
 * never clicked Start, so the other seated player isn't stuck waiting.
 *
 * @param {import('socket.io').Server} io
 * @param {string} roomId
 */
function handleReadyWindowTimeout(io, roomId) {
  readyTimers.delete(roomId);

  const room = roomManager.getRoom(roomId);
  if (!room || room.state === 'playing') return;
  room.readyDeadline = null;

  const { kicked } = roomManager.forceUnreadyPlayersToStand(roomId);
  if (!kicked.length) return;

  io.to(roomId).emit('room:updated', roomManager.serializeRoomUpdate(room));
  for (const u of kicked) {
    io.to(roomId).emit('chat:message', {
      from: null, fromId: null,
      text: `${u.displayName} không bấm Bắt đầu kịp thời nên bị rời khỏi vị trí.`,
      timestamp: Date.now(), isSystem: true,
    });
  }
  broadcastLobbyUpdate(io);
}

module.exports = {
  timerMap,
  disconnectTimers,
  emptyRoomGraceTimers,
  readyTimers,
  sessions,
  getOnlineUsersList,
  broadcastLobbyUpdate,
  sendLobbySnapshot,
  findSocketsByUserId,
  cleanupRoomTimer,
  cleanupReadyTimer,
  syncReadyWindow,
  restartReadyWindow,
};
