'use strict';

/**
 * RoomHandler.js — Socket events for the room management domain.
 *
 * Events handled:
 *   room:leave    — leave the current room (resign first if in an active game)
 *   room:sit      — take a player slot
 *   room:stand    — vacate a player slot
 *   room:settings — update room settings (host only)
 *   room:ready    — confirm Start (Start modal); triggers game start when both players confirm
 *   room:kick     — kick a user from the room (host only)
 *
 * Start-modal ready window: once both player slots are filled, a 30s
 * server-authoritative countdown starts (see state.js syncReadyWindow). If a
 * seated player hasn't confirmed Start by the deadline, they are vacated from
 * their seat (still in the room) so the other player isn't stuck waiting.
 */

const logger      = require('../../utils/logger');
const roomManager = require('../../managers/RoomManager');
const {
  broadcastLobbyUpdate,
  cleanupRoomTimer,
  cleanupReadyTimer,
  findSocketsByUserId,
  syncReadyWindow,
  restartReadyWindow,
} = require('../state');

// Lazy-require GameHandler to avoid circular dependency at load time
function getGameHandler() { return require('./GameHandler'); }

/**
 * Register room-domain event listeners on a socket.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function register(io, socket) {
  const user = socket.user;

  socket.on('room:leave', () => {
    const roomId = roomManager.getRoomIdByUser(user.userId);
    if (!roomId) return;

    const room = roomManager.getRoom(roomId);
    if (room) {
      // Force-resign if an active game is in progress
      if (room.gameState && room.gameState.status === 'ongoing') {
        const isPlayer = room.gameState.players.some(p => p.userId === user.userId);
        if (isPlayer) {
          const result = room.gameState.resign(user.userId);
          if (!result.error) {
            const gameResult = room.gameState.result;
            getGameHandler().handleGameEnd(io, room);
            io.to(roomId).emit('game:ended', {
              result: gameResult,
              scoreTable: room.scoreTable,
            });
            io.to(roomId).emit('chat:message', {
              from: null, fromId: null,
              text: `${user.displayName} rời phòng (xử thua).`,
              timestamp: Date.now(), isSystem: true,
            });
          }
        }
      }

      io.to(roomId).emit('chat:message', {
        from: null, fromId: null,
        text: `${user.displayName} đã rời phòng.`,
        timestamp: Date.now(), isSystem: true,
      });
    }

    const result = roomManager.leaveRoom(user.userId);
    socket.leave(roomId);
    socket.emit('room:left');

    if (result.destroyed) {
      cleanupRoomTimer(roomId);
      cleanupReadyTimer(roomId);
      broadcastLobbyUpdate(io);
    } else if (result.room) {
      syncReadyWindow(io, result.room);
      io.to(roomId).emit('room:updated', roomManager.serializeRoomUpdate(result.room));
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
  });

  socket.on('room:sit', (payload = {}) => {
    const slot = parseInt(payload.slot, 10);
    const result = roomManager.sitDown(user.userId, slot);
    if (result.error) {
      socket.emit('room:error', { message: result.error });
      return;
    }
    syncReadyWindow(io, result.room);
    io.to(result.room.roomId).emit('room:updated', roomManager.serializeRoomUpdate(result.room));
    broadcastLobbyUpdate(io);
  });

  socket.on('room:stand', () => {
    const result = roomManager.standUp(user.userId);
    if (result.error) {
      socket.emit('room:error', { message: result.error });
      return;
    }
    syncReadyWindow(io, result.room);
    io.to(result.room.roomId).emit('room:updated', roomManager.serializeRoomUpdate(result.room));
    broadcastLobbyUpdate(io);
  });

  socket.on('room:settings', (payload = {}) => {
    const result = roomManager.updateSettings(user.userId, payload.settings || {});
    if (result.error) {
      socket.emit('room:error', { message: result.error });
      return;
    }
    const roomId = result.room.roomId;
    // Settings changes reset ready for seated players (RoomManager.updateSettings) —
    // restart the ready window fresh rather than leaving a stale countdown running.
    restartReadyWindow(io, result.room);
    // The one room:updated that must carry `settings`: this is the only event
    // where they actually changed, and clients merge rather than replace, so
    // this is where they learn the new values. See RoomManager.serializeRoomUpdate.
    io.to(roomId).emit('room:updated', roomManager.serializeRoom(result.room));
    broadcastLobbyUpdate(io);
    io.to(roomId).emit('chat:message', {
      from: null, fromId: null,
      text: 'Cài đặt phòng đã được thay đổi.',
      timestamp: Date.now(), isSystem: true,
    });
  });

  socket.on('room:ready', () => {
    const result = roomManager.confirmStart(user.userId);
    if (result.error) {
      socket.emit('room:error', { message: result.error });
      return;
    }

    const roomId = result.room.roomId;

    // Both players confirmed → start the game
    if (result.allReady) {
      cleanupReadyTimer(roomId);
      result.room.readyDeadline = null;
      io.to(roomId).emit('room:updated', roomManager.serializeRoomUpdate(result.room));
      getGameHandler().startGame(io, result.room);
    } else {
      io.to(roomId).emit('room:updated', roomManager.serializeRoomUpdate(result.room));
    }
  });

  socket.on('room:kick', (payload = {}) => {
    const targetId = payload.userId;
    if (!targetId) {
      socket.emit('room:error', { message: 'Thiếu thông tin người dùng.' });
      return;
    }

    const roomId = roomManager.getRoomIdByUser(user.userId);
    const result = roomManager.kickUser(user.userId, targetId);
    if (result.error) {
      socket.emit('room:error', { message: result.error });
      return;
    }

    const kickedSockets = findSocketsByUserId(io, targetId);
    for (const s of kickedSockets) {
      s.leave(roomId);
      s.emit('room:kicked', { message: 'Bạn đã bị mời ra khỏi phòng.' });
    }

    syncReadyWindow(io, result.room);
    io.to(roomId).emit('room:updated', roomManager.serializeRoomUpdate(result.room));
    broadcastLobbyUpdate(io);
  });
}

module.exports = { register };
