'use strict';

/**
 * DisconnectHandler.js — Disconnect and reconnect grace period logic.
 *
 * Exported:
 *   handleDisconnect(io, socket)      — called on socket 'disconnect'
 *   cancelDisconnectGrace(io, socket) — called on new connection; returns true if
 *                                       player was in grace period and game resumed
 */

const logger      = require('../../utils/logger');
const roomManager = require('../../managers/RoomManager');
const config      = require('../../config');
const {
  timerMap,
  disconnectTimers,
  broadcastLobbyUpdate,
  cleanupRoomTimer,
  findSocketsByUserId,
} = require('../state');
const { handleGameEnd } = require('./GameHandler');

/**
 * Handle a socket disconnect.
 * If the disconnecting user is an active player in a game, start the 60-second
 * grace period. Otherwise, remove them from the room immediately.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function handleDisconnect(io, socket) {
  const user = socket.user;
  const roomId = roomManager.getRoomIdByUser(user.userId);
  if (!roomId) return;

  const room = roomManager.getRoom(roomId);

  // RACE CONDITION FIX: if the user still has another active socket (e.g. duplicate tab),
  // skip leave / grace — only the last connection should trigger cleanup.
  const activeSockets = findSocketsByUserId(io, user.userId);
  if (activeSockets.length > 0) {
    logger.info(`[Disconnect] Stale socket closed for ${user.displayName}, active socket exists — skipping`);
    return;
  }

  // Start grace period if player is in an active game
  if (room && room.gameState && room.gameState.status === 'ongoing') {
    const isPlayer = room.gameState.players.some(p => p.userId === user.userId);
    if (isPlayer) {
      startDisconnectGrace(io, room, user);
      return;
    }
  }

  // Normal disconnect (not in game, or spectator)
  const result = roomManager.leaveRoom(user.userId);
  if (result.destroyed) {
    cleanupRoomTimer(roomId);
    broadcastLobbyUpdate(io);
  } else if (result.room) {
    io.to(roomId).emit('room:updated', roomManager.serializeRoom(result.room));
    io.to(roomId).emit('chat:message', {
      from: null, fromId: null,
      text: `${user.displayName} đã mất kết nối.`,
      timestamp: Date.now(), isSystem: true,
    });
    if (result.hostTransferred) {
      const newHost = result.room.users.get(result.room.host);
      io.to(roomId).emit('chat:message', {
        from: null, fromId: null,
        text: `${newHost ? newHost.displayName : '—'} là chủ phòng mới.`,
        timestamp: Date.now(), isSystem: true,
      });
    }
    broadcastLobbyUpdate(io);
  }
}

/**
 * Start a 60-second disconnect grace period for a player in an active game.
 * The game timer is paused, the room state becomes 'interrupted', and the
 * game is cancelled (no score) if the player does not reconnect in time.
 *
 * @param {import('socket.io').Server} io
 * @param {object} room
 * @param {{ userId: string, displayName: string }} user
 */
function startDisconnectGrace(io, room, user) {
  const roomId = room.roomId;
  const graceSec = Math.floor(config.DISCONNECT_GRACE_MS / 1000);

  // Clear any existing stale grace timer for this user
  const existing = disconnectTimers.get(user.userId);
  if (existing) {
    clearTimeout(existing.timeout);
    clearInterval(existing.countdown);
    disconnectTimers.delete(user.userId);
    logger.info(`[Disconnect] Cleared stale grace timer for ${user.displayName}`);
  }

  // Pause the game timer
  const timer = timerMap.get(roomId);
  if (timer) timer.stop();

  room.state = 'interrupted';

  io.to(roomId).emit('game:interrupted', {
    playerId: user.userId,
    playerName: user.displayName,
    secondsLeft: graceSec,
  });
  io.to(roomId).emit('chat:message', {
    from: null, fromId: null,
    text: `${user.displayName} mất kết nối. Chờ kết nối lại (${graceSec}s)...`,
    timestamp: Date.now(), isSystem: true,
  });

  let remaining = graceSec;
  const countdown = setInterval(() => {
    remaining--;
    if (remaining <= 0) clearInterval(countdown);
  }, 1000);

  const timeout = setTimeout(() => {
    clearInterval(countdown);
    disconnectTimers.delete(user.userId);

    if (room.gameState) {
      room.gameState.status = 'finished';
      room.gameState.result = { winner: null, reason: 'disconnect' };
      handleGameEnd(io, room, { noScore: true });
      io.to(roomId).emit('game:ended', {
        result: { winner: null, reason: 'disconnect' },
        scoreTable: room.scoreTable,
      });
      io.to(roomId).emit('chat:message', {
        from: null, fromId: null,
        text: `${user.displayName} không kết nối lại. Ván đấu huỷ, không ghi điểm.`,
        timestamp: Date.now(), isSystem: true,
      });
    }

    const result = roomManager.leaveRoom(user.userId);
    if (result.destroyed) cleanupRoomTimer(roomId);
    else if (result.room) io.to(roomId).emit('room:updated', roomManager.serializeRoom(result.room));
    broadcastLobbyUpdate(io);
  }, config.DISCONNECT_GRACE_MS);

  disconnectTimers.set(user.userId, { timeout, countdown, roomId });
  logger.info(`[Disconnect] Grace period started for ${user.displayName} in room ${roomId}`);
}

/**
 * Cancel the disconnect grace period and resume the game when a player reconnects.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 * @returns {boolean} true if grace was cancelled and game resumed
 */
function cancelDisconnectGrace(io, socket) {
  const user = socket.user;
  const entry = disconnectTimers.get(user.userId);
  if (!entry) return false;

  clearTimeout(entry.timeout);
  clearInterval(entry.countdown);
  disconnectTimers.delete(user.userId);

  const room = roomManager.getRoom(entry.roomId);
  if (!room || !room.gameState) return false;

  room.state = 'playing';
  socket.join(entry.roomId);

  const timer = timerMap.get(entry.roomId);
  if (timer) timer.start();

  io.to(entry.roomId).emit('game:resumed', { playerId: user.userId });
  socket.emit('game:init', {
    ...room.gameState.serialize(),
    timer: timer ? timer.getTimers() : null,
  });
  io.to(entry.roomId).emit('room:updated', roomManager.serializeRoom(room));
  io.to(entry.roomId).emit('chat:message', {
    from: null, fromId: null,
    text: `${user.displayName} đã kết nối lại! Ván đấu tiếp tục.`,
    timestamp: Date.now(), isSystem: true,
  });

  logger.info(`[Disconnect] ${user.displayName} reconnected, game resumed in room ${entry.roomId}`);
  return true;
}

module.exports = { handleDisconnect, cancelDisconnectGrace };
