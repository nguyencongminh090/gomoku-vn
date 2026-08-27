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
 *   - handlers/TournamentHandler.js      — tournament:* (create/register/pairing scheduling)
 *   - handlers/TournamentMatchHandler.js — tmatch:* (a pairing's live GameEngine)
 *
 * No event names or payload structures are changed by this refactor.
 */

const logger             = require('../utils/logger');
const { clientInfoFromSocket } = require('../utils/geo');
const roomManager        = require('../managers/RoomManager');
const sessionManager     = require('../managers/SessionManager');
const config             = require('../config');
const {
  timerMap,
  sessions,
  broadcastLobbyUpdate,
  broadcastOnlineUsers,
  broadcastRoomUpdate,
  clearRoomUpdateSnapshot,
  cleanupRoomTimer,
  buildRoomStatePayload,
} = require('./state');

const LobbyHandler      = require('./handlers/LobbyHandler');
const RoomHandler       = require('./handlers/RoomHandler');
const GameHandler       = require('./handlers/GameHandler');
const ChatHandler       = require('./handlers/ChatHandler');
const PrivateChatHandler = require('./handlers/PrivateChatHandler');
const DisconnectHandler = require('./handlers/DisconnectHandler');
const TournamentHandler      = require('./handlers/TournamentHandler');
const TournamentMatchHandler = require('./handlers/TournamentMatchHandler');

/**
 * Initialize the Socket.io event handler.
 * @param {import('socket.io').Server} io
 */
function init(io) {
  // One-time wiring of TournamentManager's events (tournament_started,
  // tournament_completed, pairing_changed) to broadcasts — see
  // TournamentHandler.js's header for why this is init(), not register().
  TournamentHandler.init(io);

  // Listen for idle room destructions and clean up
  roomManager.on('room_destroyed', (roomId) => {
    io.to(roomId).emit('room:destroyed', { message: 'Phòng đã tự động đóng do quá lâu không có hoạt động.', code: 'ROOM_AUTO_CLOSED' });
    io.in(roomId).socketsLeave(roomId);
    // Goes through the shared broadcast so the lobby gets a delta like every
    // other mutation. Emitting a full list straight to the lobby here (as this
    // did) both wasted the payload and left the delta baseline stale, so the
    // next patch re-announced a removal the lobby had already been told about.
    broadcastLobbyUpdate(io);
    // `_destroyRoom` is the single choke point for every teardown path (idle
    // cleanup, last member leaving, etc.), so this is the one place that needs
    // to drop the room's `room:updated` diff baseline — otherwise state.js's
    // snapshot maps would grow forever as rooms are created and destroyed.
    clearRoomUpdateSnapshot(roomId);
  });

  // Socket event flood-protection middleware
  //
  // The window ticker is evaluated *lazily*, on the events themselves, rather
  // than from a per-socket setInterval(1s) (TODO.md #148): one timer per
  // connection means N timers waking the single event loop every second at
  // idle, which taxes every player rather than just the flooder.
  //
  // The two-layer semantics are unchanged — discrete 1s windows, a soft
  // in-window block (swallow the event, one RATE_LIMITED per window) and a
  // hard disconnect after FLOOD_DISCONNECT_STREAK consecutive over-limit
  // windows. Only *when* a boundary is evaluated moves: a boundary can only
  // change anything if events happened, and a socket that has gone silent has
  // no events to count, so a silent window's verdict ("clean, reset streak")
  // is the same whether it is computed at the boundary or on the next event.
  // The one behavioural difference: a socket that floods its final streak
  // window and then goes permanently silent is disconnected on its next event
  // instead of at the boundary. While silent it costs nothing and every event
  // it sent past the limit was already swallowed, so nothing it could do in
  // that gap is un-punished.
  io.use((socket, next) => {
    const WINDOW_MS = 1000;
    let windowStart = Date.now();
    let eventCount = 0;
    let warnedThisWindow = false;
    let violationStreak = 0;

    /**
     * Close out every window boundary that has passed since the last event and
     * open the current one. Returns true if the socket was disconnected, in
     * which case the caller must drop the event.
     */
    const rollWindows = (now) => {
      const elapsed = Math.floor((now - windowStart) / WINDOW_MS);
      if (elapsed < 1) return false;
      // Only the most recently opened window ever recorded events; any further
      // elapsed window passed with the socket silent, by construction.
      if (eventCount > config.MAX_EVENTS_PER_SECOND) {
        violationStreak++;
        if (violationStreak >= config.FLOOD_DISCONNECT_STREAK) {
          socket.disconnect(true);
          return true;
        }
      } else {
        violationStreak = 0;
      }
      // A silent window is a clean window, so any gap breaks the streak.
      if (elapsed > 1) violationStreak = 0;
      // Advance on the original 1s grid, exactly where the interval would have
      // put it, instead of restarting the window at `now`.
      windowStart += elapsed * WINDOW_MS;
      eventCount = 0;
      warnedThisWindow = false;
      return false;
    };

    const origEmit = socket.onevent;
    socket.onevent = function(packet) {
      if (rollWindows(Date.now())) return;
      eventCount++;
      if (eventCount > config.MAX_EVENTS_PER_SECOND) {
        if (!warnedThisWindow) {
          socket.emit('room:error', { message: 'Bạn đang gửi quá nhiều yêu cầu. Vui lòng chờ.', code: 'RATE_LIMITED' });
          warnedThisWindow = true;
        }
        return;
      }
      origEmit.call(this, packet);
    };
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    const { ip, geo } = clientInfoFromSocket(socket);
    logger.info('[Socket] Connected', {
      user: user.displayName, uid: user.userId, sid: socket.id, ip, geo,
    });

    // ── Single-device-per-token enforcement ─────────────────────────────────
    // Exactly one live session per userId is allowed. The `sessions` map IS
    // the session registry (userId → live Socket), so finding the prior
    // session for this user is a single O(1) Map.get — no need to scan
    // io.sockets.sockets. Evict it first, before the disconnect-grace check
    // and the existingRoom rejoin below, so a stale session can never race
    // the new one back into a room.
    //
    // A connection flagged `auth.reconnect` (see socket-client.js's
    // reconnect_attempt listener) is this SAME browser tab re-establishing
    // its own dropped transport (ping timeout, brief wifi/proxy hiccup) —
    // not a second device. Server-side disconnect detection lags the
    // client's own (default pingTimeout ~20s), so the old socket can still
    // be sitting in `sessions` when the reconnect arrives. Still evict it
    // (it's dead or about to be), but skip the 'session:kicked' notice: that
    // notice makes the client wipe its session and bounce to the login page,
    // which is exactly the false "logged in on another device" symptom this
    // guards against. A genuine second-device login never carries this flag.
    const staleSocket = sessions.get(user.userId);
    if (staleSocket) {
      const isOwnReconnect = !!(socket.handshake && socket.handshake.auth && socket.handshake.auth.reconnect);
      if (!isOwnReconnect) {
        // Revoke BEFORE disconnecting (TODO.md #68). Disconnecting a socket
        // only closes a transport — with server-side sessions the evicted
        // device still holds a working session cookie, so without this it
        // would simply reconnect and win the account straight back, and
        // "signed in on another device" would be a message rather than an
        // eviction. Scoped to this user's OTHER sessions; the one that just
        // connected is spared by exceptSessionId.
        sessionManager.revokeOtherSessionsForUser(user.userId, socket.sessionId);
        staleSocket.emit('session:kicked', { message: 'Tài khoản của bạn vừa đăng nhập ở một thiết bị khác.', code: 'SESSION_KICKED' });
      }
      staleSocket.disconnect(true);
    }

    // Wrap socket.on so every domain handler registered below is automatically:
    //   1. protected from crashing the whole process on a thrown error, and
    //   2. guaranteed a plain-object payload, even if the client sends null/a
    //      string/a number instead of `undefined` (which is the only value
    //      default parameters like `(payload = {})` actually guard against).
    // Built-in lifecycle events (currently just 'disconnect') are exempted
    // from the payload coercion: socket.io calls their listener with a
    // string reason ('ping timeout', 'transport close', ...), and coercing
    // that string to {} turned every disconnect log into an unreadable
    // "reason=[object Object]" — destroying the exact signal needed to tell
    // a network-driven reconnect apart from a deliberate disconnect.
    const origOn = socket.on.bind(socket);
    const RAW_PAYLOAD_EVENTS = new Set(['disconnect']);
    socket.on = function wrappedOn(event, listener) {
      if (typeof listener !== 'function') return origOn(event, listener);
      return origOn(event, (...args) => {
        if (!RAW_PAYLOAD_EVENTS.has(event) && args.length > 0 && (typeof args[0] !== 'object' || args[0] === null)) {
          args[0] = {};
        }
        try {
          listener(...args);
        } catch (err) {
          logger.error(`[Socket] Handler error on '${event}' for ${user.displayName} (${user.userId}):`, err.stack || err.message);
          socket.emit('room:error', { message: 'Đã xảy ra lỗi. Vui lòng thử lại.', code: 'GENERIC_ERROR' });
        }
      });
    };

    // Hand the client its own identity (TODO.md #68). The client used to read
    // this by base64-decoding the JWT it held; with an HttpOnly credential
    // there is nothing for it to decode, so the server — which is the real
    // source of truth anyway — states who this socket belongs to. Emitted
    // before any room state below, so the UI knows which player it is by the
    // time a room:joined arrives.
    socket.emit('session:me', {
      userId: user.userId,
      displayName: user.displayName,
      isGuest: !!user.isGuest,
    });

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
    // Same reasoning as above, for the spectator/non-ongoing-player grace
    // window (TODO.md #39 / instruction.md §39) — must also run before the
    // rejoin checks below.
    DisconnectHandler.cancelSpectatorGrace(user.userId);

    // Check if this is a reconnect during a disconnect grace period
    if (DisconnectHandler.cancelDisconnectGrace(io, socket)) {
      // Game resumed — nothing more to do
    } else {
      // Check if user was already in a room (normal page-refresh reconnect)
      const existingRoom = roomManager.getRoomByUser(user.userId);
      if (existingRoom) {
        socket.join(existingRoom.roomId);

        // A fresh connection replacing one lost during an empty-room/spectator
        // grace window (see DisconnectHandler.js) left this user's own entry
        // marked 'disconnected' — clear it now that they're actually back, and
        // tell the room's other occupants before this reconnecter's own
        // `room:joined` payload is built, so it reflects 'active' too.
        const reconnectedUser = existingRoom.users.get(user.userId);
        if (reconnectedUser && reconnectedUser.presence === 'disconnected') {
          reconnectedUser.presence = 'active';
          broadcastRoomUpdate(io, existingRoom);
        }

        // Shared with game:resync (TODO.md #152) so both rebuild paths hand
        // the client byte-identical state — see buildRoomStatePayload().
        socket.emit('room:joined', buildRoomStatePayload(existingRoom));
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
        socket.emit('room:destroyed', { message: 'Phòng không còn tồn tại. Bạn sẽ được đưa về sảnh chờ.', code: 'ROOM_GONE' });
      }
    }

    // Reconnect during a live tournament match — same reasoning as the
    // existingRoom check above, for TournamentMatchHandler's disjoint
    // room/session model.
    TournamentMatchHandler.resyncOnConnect(io, socket);

    // ── Wire domain handlers ──────────────────────────────────────────────
    LobbyHandler.register(io, socket);
    RoomHandler.register(io, socket);
    GameHandler.register(io, socket);
    ChatHandler.register(io, socket);
    PrivateChatHandler.register(io, socket);
    TournamentHandler.register(io, socket);
    TournamentMatchHandler.register(io, socket);

    // ── Disconnect ────────────────────────────────────────────────────────
    socket.on('disconnect', (reason) => {
      logger.info('[Socket] Disconnected', {
        user: user.displayName, uid: user.userId, sid: socket.id, ip, geo, reason,
      });

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
      PrivateChatHandler.cleanupUser(io, user.userId);
    });

    // ── Per-socket error handler ──────────────────────────────────────────
    socket.on('error', (err) => {
      logger.error(`[Socket] Unhandled error for ${user.displayName}:`, err.stack || err.message);
      socket.emit('room:error', { message: 'Đã xảy ra lỗi. Vui lòng thử lại.', code: 'GENERIC_ERROR' });
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
