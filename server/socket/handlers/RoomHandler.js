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
 * Start-modal ready window: once both player slots are filled, players wait
 * (no countdown) until one of them clicks Start. That opens a 15s
 * server-authoritative countdown for the other seat (see state.js
 * handleReadyClick). If they don't confirm in time, it counts as one miss
 * (up to 3) — see RoomManager.registerReadyMiss and instruction.md §B36.
 */

const logger      = require('../../utils/logger');
const roomManager = require('../../managers/RoomManager');
const {
  broadcastLobbyUpdate,
  broadcastRoomUpdate,
  cleanupRoomTimer,
  cleanupReadyTimer,
  findSocketsByUserId,
  clearReadyState,
  handleReadyClick,
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
              code: 'ROOM_PLAYER_LEFT_FORFEIT', vars: { name: user.displayName },
              timestamp: Date.now(), isSystem: true,
            });
          }
        }
      }

      io.to(roomId).emit('chat:message', {
        from: null, fromId: null,
        text: `${user.displayName} đã rời phòng.`,
        code: 'ROOM_PLAYER_LEFT', vars: { name: user.displayName },
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
      clearReadyState(io, result.room);
      broadcastRoomUpdate(io, result.room);
      if (result.hostTransferred) {
        const newHost = result.room.users.get(result.room.host);
        io.to(roomId).emit('chat:message', {
          from: null, fromId: null,
          text: `${newHost ? newHost.displayName : '—'} là chủ phòng mới.`,
          code: 'ROOM_NEW_HOST', vars: { name: newHost ? newHost.displayName : '—' },
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
      socket.emit('room:error', { message: result.error, code: result.code });
      return;
    }
    clearReadyState(io, result.room);
    broadcastRoomUpdate(io, result.room);
    broadcastLobbyUpdate(io);
  });

  socket.on('room:stand', () => {
    const result = roomManager.standUp(user.userId);
    if (result.error) {
      socket.emit('room:error', { message: result.error, code: result.code });
      return;
    }
    clearReadyState(io, result.room);
    broadcastRoomUpdate(io, result.room);
    broadcastLobbyUpdate(io);
  });

  // Client-reported tab-visibility state (Page Visibility API) — drives the
  // "leaved site" (away) status dot on the slot cards. Silent on error: this
  // fires often (every tab switch) and isn't worth surfacing a toast for a
  // stale/out-of-room event.
  socket.on('room:presence', (payload = {}) => {
    const result = roomManager.setPresence(user.userId, payload.presence);
    if (result.error) return;
    broadcastRoomUpdate(io, result.room);
  });

  socket.on('room:settings', (payload = {}) => {
    const result = roomManager.updateSettings(user.userId, payload.settings || {});
    if (result.error) {
      socket.emit('room:error', { message: result.error, code: result.code });
      return;
    }
    const roomId = result.room.roomId;
    // Settings changes reset ready for seated players (RoomManager.updateSettings) —
    // cancel any in-flight countdown rather than leaving a stale one running;
    // it does NOT auto-restart (a player must click Start again).
    clearReadyState(io, result.room);
    // The one room:updated that must carry `settings`: this is the only event
    // where they actually changed, and clients merge rather than replace, so
    // this is where they learn the new values. See RoomManager.serializeRoomUpdate.
    broadcastRoomUpdate(io, result.room, { settings: true });
    broadcastLobbyUpdate(io);
    io.to(roomId).emit('chat:message', {
      from: null, fromId: null,
      text: 'Cài đặt phòng đã được thay đổi.',
      code: 'ROOM_SETTINGS_CHANGED',
      timestamp: Date.now(), isSystem: true,
    });
  });

  socket.on('room:ready', () => {
    const result = roomManager.confirmStart(user.userId);
    if (result.error) {
      socket.emit('room:error', { message: result.error, code: result.code });
      return;
    }

    const room = result.room;

    // Both players confirmed → start the game
    if (result.allReady) {
      cleanupReadyTimer(room.roomId);
      room.readyDeadline = null;
      room.readyMissCount = 0;
      broadcastRoomUpdate(io, room);
      getGameHandler().startGame(io, room);
    } else {
      // First click of the pair — open the 15s window for the other seat.
      handleReadyClick(io, room);
      broadcastRoomUpdate(io, room);
    }
  });

  socket.on('room:kick', (payload = {}) => {
    const targetId = payload.userId;
    if (!targetId) {
      socket.emit('room:error', { message: 'Thiếu thông tin người dùng.', code: 'MISSING_USER_INFO' });
      return;
    }

    const roomId = roomManager.getRoomIdByUser(user.userId);
    const result = roomManager.kickUser(user.userId, targetId);
    if (result.error) {
      socket.emit('room:error', { message: result.error, code: result.code });
      return;
    }

    const kickedSockets = findSocketsByUserId(io, targetId);
    for (const s of kickedSockets) {
      s.leave(roomId);
      s.emit('room:kicked', { message: 'Bạn đã bị mời ra khỏi phòng.', code: 'KICKED' });
    }

    clearReadyState(io, result.room);
    broadcastRoomUpdate(io, result.room);
    broadcastLobbyUpdate(io);
  });
}

module.exports = { register };
