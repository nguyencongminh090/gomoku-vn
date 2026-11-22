'use strict';

/**
 * ChatHandler.js (socket layer) — Socket events for the chat domain.
 *
 * Events handled:
 *   chat:message — send a message in the current room
 *   room:react   — float a reaction (#368) to the rest of the room
 *
 * This is the socket-level wiring. Actual rate-limiting and content handling
 * are delegated to managers/ChatHandler.js.
 */

const roomManager = require('../../managers/RoomManager');
const chatManager = require('../../managers/ChatHandler');

// #435: the room page acks + resends chat (a message emitted into a silently dead socket is lost), so
// the same message can arrive twice (first copy did land, only its ack was lost). Remember the last few
// client ids per user — across sockets, since the resend goes out on the reconnected one.
const SEEN_PER_USER = 20;
const SEEN_MAX_USERS = 5000;
const seenCids = new Map(); // userId -> [cid, ...] (oldest first); Map order = least recently used first

function alreadySeen(userId, cid) {
  if (typeof cid !== 'string' || !cid || cid.length > 64) return false; // old clients: no id, no dedupe
  const list = seenCids.get(userId) || [];
  if (list.includes(cid)) return true;
  list.push(cid);
  if (list.length > SEEN_PER_USER) list.shift();
  seenCids.delete(userId);
  seenCids.set(userId, list);
  if (seenCids.size > SEEN_MAX_USERS) seenCids.delete(seenCids.keys().next().value);
  return false;
}

/**
 * Register chat-domain event listeners on a socket.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function register(io, socket) {
  const user = socket.user;

  socket.on('chat:message', (payload, ack) => {
    payload = payload || {};
    const done = typeof ack === 'function' ? ack : () => {};
    const roomId = roomManager.getRoomIdByUser(user.userId);
    if (!roomId) {
      socket.emit('chat:error', { message: 'Bạn cần vào phòng để chat.', code: 'MUST_BE_IN_ROOM_TO_CHAT' });
      done({ ok: false });
      return;
    }
    if (alreadySeen(user.userId, payload.cid)) {
      done({ ok: true, dup: true });
      return;
    }

    // Chat counts as activity to prevent idle room destruction
    const room = roomManager.getRoom(roomId);
    if (room) room.lastActivity = Date.now();

    chatManager.handleMessage(io, socket, roomId, payload.text || '');
    done({ ok: true });
  });

  socket.on('room:react', (payload = {}) => {
    const roomId = roomManager.getRoomIdByUser(user.userId);
    if (!roomId) return; // not in a room: nothing to show it to
    chatManager.handleReaction(socket, roomId, payload && payload.kind);
  });
}

module.exports = { register, _seenCids: seenCids };
