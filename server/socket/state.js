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

module.exports = {
  timerMap,
  disconnectTimers,
  sessions,
  getOnlineUsersList,
  broadcastLobbyUpdate,
  findSocketsByUserId,
  cleanupRoomTimer,
};
