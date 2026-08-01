'use strict';

/**
 * LobbyHandler.js — Socket events for the lobby domain.
 *
 * Events handled:
 *   lobby:subscribe   — join the lobby Socket.io room and receive current state
 *   lobby:unsubscribe — leave the lobby room
 *   room:create       — create a new room and join it
 *   room:join         — join an existing room by ID
 */

const logger      = require('../../utils/logger');
const roomManager = require('../../managers/RoomManager');
const {
  timerMap,
  broadcastLobbyUpdate,
} = require('../state');

const LOBBY_ROOM = 'lobby';

/**
 * Register lobby-domain event listeners on a socket.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function register(io, socket) {
  const user = socket.user;

  socket.on('lobby:subscribe', () => {
    socket.join(LOBBY_ROOM);
    socket.emit('lobby:update', { rooms: roomManager.listRooms() });
    socket.emit('lobby:online_users', _getOnlineList(io));
  });

  socket.on('lobby:unsubscribe', () => {
    socket.leave(LOBBY_ROOM);
  });

  socket.on('room:create', (payload = {}) => {
    const result = roomManager.createRoom(
      {
        userId: user.userId,
        displayName: user.displayName,
        isGuest: user.isGuest,
        // Raw socket address. Behind a reverse proxy every connection would
        // report the proxy's address instead, collapsing all users into one
        // quota — that needs `app.set('trust proxy', <hops>)` plus reading the
        // forwarded address, which is tracked as TODO Phần A #1 and is not
        // this item's call to make.
        ip: socket.handshake && socket.handshake.address,
      },
      payload.settings || {}
    );

    if (result.error) {
      socket.emit('room:error', { message: result.error });
      return;
    }

    const room = result.room;
    socket.leave(LOBBY_ROOM);
    socket.join(room.roomId);
    socket.emit('room:joined', roomManager.serializeRoom(room));
    broadcastLobbyUpdate(io);
  });

  socket.on('room:join', (payload = {}) => {
    if (!payload.roomId) {
      socket.emit('room:error', { message: 'Thiếu mã phòng.' });
      return;
    }

    const result = roomManager.joinRoom(
      { userId: user.userId, displayName: user.displayName, isGuest: user.isGuest },
      payload.roomId
    );

    if (result.error) {
      socket.emit('room:error', { message: result.error });
      return;
    }

    const room = result.room;
    socket.leave(LOBBY_ROOM);
    socket.join(room.roomId);

    const joinPayload = roomManager.serializeRoom(room);
    // If a game is active, include game state so joining spectators can catch up
    if (room.gameState) {
      joinPayload.gameState = room.gameState.serialize();
      const timer = timerMap.get(room.roomId);
      if (timer) joinPayload.timer = timer.getTimers();
    }
    socket.emit('room:joined', joinPayload);
    socket.to(room.roomId).emit('room:updated', roomManager.serializeRoomUpdate(room));
    broadcastLobbyUpdate(io);

    io.to(room.roomId).emit('chat:message', {
      from: null, fromId: null,
      text: `${user.displayName} đã vào phòng.`,
      timestamp: Date.now(), isSystem: true,
    });
  });
}

/**
 * Build the online-users list for a lobby:online_users emission.
 * Reads directly from io.sockets to avoid a shared-state import cycle.
 *
 * @param {import('socket.io').Server} io
 */
function _getOnlineList(io) {
  // Delegate to the sessions registry in state.js via the parent SocketHandler
  // by re-reading it here.  We import it lazily to avoid circular refs at
  // module load time.
  const { getOnlineUsersList } = require('../state');
  return getOnlineUsersList();
}

module.exports = { register };
