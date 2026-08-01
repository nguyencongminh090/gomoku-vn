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

/** Broadcast the current room list to everyone in the lobby room. */
function broadcastLobbyUpdate(io) {
  io.to('lobby').emit('lobby:update', { rooms: roomManager.listRooms() });
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

  io.to(roomId).emit('room:updated', roomManager.serializeRoom(room));
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
  readyTimers,
  sessions,
  getOnlineUsersList,
  broadcastLobbyUpdate,
  findSocketsByUserId,
  cleanupRoomTimer,
  cleanupReadyTimer,
  syncReadyWindow,
  restartReadyWindow,
};
