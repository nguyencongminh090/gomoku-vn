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
  emptyRoomGraceTimers,
  broadcastLobbyUpdate,
  broadcastRoomUpdate,
  sendLobbySnapshot,
  getClientIp,
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
    // Full snapshot first — every later broadcast is only a delta against it,
    // so a client that joins mid-stream has nothing to apply patches to
    // until it has received this.
    sendLobbySnapshot(io, socket);
    socket.emit('lobby:online_users', _getOnlineList(io));
  });

  socket.on('lobby:unsubscribe', () => {
    socket.leave(LOBBY_ROOM);
  });

  socket.on('room:create', (payload = {}) => {
    // roomIds currently sitting in DisconnectHandler's empty-room grace
    // window (state.js `emptyRoomGraceTimers` is keyed by userId, not
    // roomId, so collect the `.roomId` off each pending entry) — passed
    // through so RoomManager.createRoom can exempt them from the main
    // MAX_ROOMS_PER_IP quota while still bounding them separately. See
    // TODO.md #43 / instruction.md §43.
    const graceRoomIds = new Set();
    for (const { roomId } of emptyRoomGraceTimers.values()) graceRoomIds.add(roomId);

    const result = roomManager.createRoom(
      {
        userId: user.userId,
        displayName: user.displayName,
        isGuest: user.isGuest,
        // See getClientIp() in state.js: resolves the real client address
        // even behind a same-host proxy (e.g. cloudflared), instead of the
        // raw socket address, which would collapse every real user behind
        // that proxy into one shared IP for quota purposes.
        ip: getClientIp(socket),
      },
      payload.settings || {},
      graceRoomIds
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
      if (timer) {
        joinPayload.timer = timer.getTimers();
        joinPayload.timerSync = timer.getSync();
      }
    }
    socket.emit('room:joined', joinPayload);
    broadcastRoomUpdate(io, room);
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
