'use strict';

/**
 * ChatHandler.js (socket layer) — Socket events for the chat domain.
 *
 * Events handled:
 *   chat:message — send a message in the current room
 *
 * This is the socket-level wiring. Actual rate-limiting and content handling
 * are delegated to managers/ChatHandler.js.
 */

const roomManager = require('../../managers/RoomManager');
const chatManager = require('../../managers/ChatHandler');

/**
 * Register chat-domain event listeners on a socket.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function register(io, socket) {
  const user = socket.user;

  socket.on('chat:message', (payload = {}) => {
    const roomId = roomManager.getRoomIdByUser(user.userId);
    if (!roomId) {
      socket.emit('chat:error', { message: 'Bạn cần vào phòng để chat.', code: 'MUST_BE_IN_ROOM_TO_CHAT' });
      return;
    }

    // Chat counts as activity to prevent idle room destruction
    const room = roomManager.getRoom(roomId);
    if (room) room.lastActivity = Date.now();

    chatManager.handleMessage(io, socket, roomId, payload.text || '');
  });
}

module.exports = { register };
