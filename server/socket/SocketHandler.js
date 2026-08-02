'use strict';

/**
 * SocketHandler.js — Socket.io event routing orchestrator.
 *
 * This file is intentionally thin. All domain logic lives in handlers/:
 *   - handlers/LobbyHandler.js      — lobby:*, room:create, room:join
 *   - handlers/RoomHandler.js       — room:leave, sit, stand, settings, ready, kick
 *   - handlers/GameHandler.js       — game:*
 *   - handlers/ChatHandler.js       — chat:message
 *   - handlers/DisconnectHandler.js — disconnect grace period
 *
 * No event names or payload structures are changed by this refactor.
 */

const logger             = require('../utils/logger');
const roomManager        = require('../managers/RoomManager');
const config             = require('../config');
const {
  timerMap,
  sessions,
  broadcastLobbyUpdate,
  broadcastOnlineUsers,
  cleanupRoomTimer,
} = require('./state');

const LobbyHandler      = require('./handlers/LobbyHandler');
const RoomHandler       = require('./handlers/RoomHandler');
const GameHandler       = require('./handlers/GameHandler');
const ChatHandler       = require('./handlers/ChatHandler');
const DisconnectHandler = require('./handlers/DisconnectHandler');

/**
 * Initialize the Socket.io event handler.
 * @param {import('socket.io').Server} io
 */
function init(io) {
  // Listen for idle room destructions and clean up
  roomManager.on('room_destroyed', (roomId) => {
    io.to(roomId).emit('room:destroyed', { message: 'Phòng đã tự động đóng do quá lâu không có hoạt động.' });
    io.in(roomId).socketsLeave(roomId);
    // Goes through the shared broadcast so the lobby gets a delta like every
    // other mutation. Emitting a full list straight to the lobby here (as this
    // did) both wasted the payload and left the delta baseline stale, so the
    // next patch re-announced a removal the lobby had already been told about.
    broadcastLobbyUpdate(io);
  });

  // Socket event flood-protection middleware
  io.use((socket, next) => {
    let eventCount = 0;
    let warnedThisWindow = false;
    let violationStreak = 0;
    const resetInterval = setInterval(() => {
      if (eventCount > config.MAX_EVENTS_PER_SECOND) {
        violationStreak++;
        if (violationStreak >= config.FLOOD_DISCONNECT_STREAK) {
          socket.disconnect(true);
        }
      } else {
        violationStreak = 0;
      }
      eventCount = 0;
      warnedThisWindow = false;
    }, 1000);
    const origEmit = socket.onevent;
    socket.onevent = function(packet) {
      eventCount++;
      if (eventCount > config.MAX_EVENTS_PER_SECOND) {
        if (!warnedThisWindow) {
          socket.emit('room:error', { message: 'Bạn đang gửi quá nhiều yêu cầu. Vui lòng chờ.' });
          warnedThisWindow = true;
        }
        return;
      }
      origEmit.call(this, packet);
    };
    socket.on('disconnect', () => clearInterval(resetInterval));
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    logger.info(`[Socket] Connected: ${user.displayName} (${user.userId}) sid=${socket.id}`);

    // ── Single-device-per-token enforcement ─────────────────────────────────
    // Exactly one live session per userId is allowed. The `sessions` map IS
    // the session registry (userId → live Socket), so finding the prior
    // session for this user is a single O(1) Map.get — no need to scan
    // io.sockets.sockets. Evict it first, before the disconnect-grace check
    // and the existingRoom rejoin below, so a stale session can never race
    // the new one back into a room.
    const staleSocket = sessions.get(user.userId);
    if (staleSocket) {
      staleSocket.emit('session:kicked', { message: 'Tài khoản của bạn vừa đăng nhập ở một thiết bị khác.' });
      staleSocket.disconnect(true);
    }

    // Wrap socket.on so every domain handler registered below is automatically:
    //   1. protected from crashing the whole process on a thrown error, and
    //   2. guaranteed a plain-object payload, even if the client sends null/a
    //      string/a number instead of `undefined` (which is the only value
    //      default parameters like `(payload = {})` actually guard against).
    const origOn = socket.on.bind(socket);
    socket.on = function wrappedOn(event, listener) {
      if (typeof listener !== 'function') return origOn(event, listener);
      return origOn(event, (...args) => {
        if (args.length > 0 && (typeof args[0] !== 'object' || args[0] === null)) {
          args[0] = {};
        }
        try {
          listener(...args);
        } catch (err) {
          logger.error(`[Socket] Handler error on '${event}' for ${user.displayName} (${user.userId}):`, err.stack || err.message);
          socket.emit('room:error', { message: 'Đã xảy ra lỗi. Vui lòng thử lại.' });
        }
      });
    };

    // Track this connection as the user's active session (see eviction above)
    const wasOnline = sessions.has(user.userId);
    sessions.set(user.userId, socket);
    if (!wasOnline) {
      broadcastOnlineUsers(io);
    }

    // Cancel any pending empty-room grace for this user (see
    // DisconnectHandler.js) before the reconnect/rejoin checks below run, so
    // a returning socket — e.g. room.html's fresh connection right after
    // index.html's navigated away — finds the room still there.
    DisconnectHandler.cancelEmptyRoomGrace(user.userId);

    // Check if this is a reconnect during a disconnect grace period
    if (DisconnectHandler.cancelDisconnectGrace(io, socket)) {
      // Game resumed — nothing more to do
    } else {
      // Check if user was already in a room (normal page-refresh reconnect)
      const existingRoom = roomManager.getRoomByUser(user.userId);
      if (existingRoom) {
        socket.join(existingRoom.roomId);
        const payload = roomManager.serializeRoom(existingRoom);
        if (existingRoom.gameState) {
          payload.gameState = existingRoom.gameState.serialize();
          const timer = timerMap.get(existingRoom.roomId);
          if (timer) {
            payload.timer = timer.getTimers();
            // Reconnecting mid-game: hand over the deadline too, so the local
            // countdown restarts in step with the server instead of freezing.
            payload.timerSync = timer.getSync();
          }
        }
        socket.emit('room:joined', payload);
        logger.info(`[Socket] ${user.displayName} reconnected to room ${existingRoom.roomId}`);
      } else if (socket.handshake && socket.handshake.auth && socket.handshake.auth.reconnect) {
        // Room state lives in memory only, so a server restart (or an idle
        // cleanup that ran while this client was offline) leaves a room page
        // attached to a room that no longer exists. Socket.io reconnects
        // silently and the room page only sends room:join once per page load,
        // so without this the page waits forever for state that will never
        // arrive.
        //
        // The `reconnect` guard is essential, not defensive: on a *first*
        // connect no user is in a room yet — the room page connects and only
        // then sends room:create/room:join — so emitting here unconditionally
        // bounces every visitor out of the room they are in the middle of
        // creating or joining. The client sets this auth flag from the
        // Manager's reconnect_attempt (see client/js/socket-client.js), so it
        // is only ever true for a connection that replaces an earlier one.
        socket.emit('room:destroyed', { message: 'Phòng không còn tồn tại. Bạn sẽ được đưa về sảnh chờ.' });
      }
    }

    // ── Wire domain handlers ──────────────────────────────────────────────
    LobbyHandler.register(io, socket);
    RoomHandler.register(io, socket);
    GameHandler.register(io, socket);
    ChatHandler.register(io, socket);

    // ── Disconnect ────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      logger.info(`[Socket] Disconnected: ${user.displayName} (${user.userId}) reason=${reason}`);

      // Only clear the session entry if it still points at THIS socket — a
      // kicked/stale socket's disconnect must not erase the newer session
      // that already replaced it in the registry (see eviction above).
      if (sessions.get(user.userId) === socket) {
        sessions.delete(user.userId);
        broadcastOnlineUsers(io);
      }

      DisconnectHandler.handleDisconnect(io, socket);

      // Clean up user's chat state
      const chatManager = require('../managers/ChatHandler');
      chatManager.cleanupUser(user.userId);
    });

    // ── Per-socket error handler ──────────────────────────────────────────
    socket.on('error', (err) => {
      logger.error(`[Socket] Unhandled error for ${user.displayName}:`, err.stack || err.message);
      socket.emit('room:error', { message: 'Đã xảy ra lỗi. Vui lòng thử lại.' });
    });
  });

  io.engine.on('connection_error', (err) => {
    logger.warn('[Socket] Connection error:', err.message);
  });

  // Periodic cleanup: remove orphan timers for rooms that no longer exist
  setInterval(() => {
    for (const [roomId] of timerMap) {
      if (!roomManager.getRoom(roomId)) {
        cleanupRoomTimer(roomId);
        logger.info(`[Socket] Orphan timer cleaned for destroyed room ${roomId}`);
      }
    }
  }, 60_000);
}

module.exports = { init };
