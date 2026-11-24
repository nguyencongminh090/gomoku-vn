'use strict';

/**
 * LobbyHandler.js — Socket events for the lobby domain.
 *
 * Events handled:
 *   lobby:subscribe   — {rule?}: join the lobby and that rule tab's channel (#439), receive its state
 *   lobby:unsubscribe — leave the lobby and its channel
 *   room:create       — create a new room and join it
 *   room:join         — join an existing room by ID
 */

const logger      = require('../../utils/logger');
const roomManager = require('../../managers/RoomManager');
const database    = require('../../db/database');
const {
  timerMap,
  emptyRoomGraceTimers,
  broadcastLobbyUpdate,
  broadcastRoomUpdate,
  sendLobbySnapshot,
  sendOnlineSnapshot,
  queryOnlineUsers,
  queryLobbyRooms,
  getClientIp,
  LOBBY_ROOM,
  lobbyChannelOf,
  lobbyRoomOf,
  leaveLobby,
  setSeatAlert,
  clearSeatAlert,
} = require('../state');

const ONLINE_SEARCH_MIN_INTERVAL_MS = 200; // #381

/**
 * Register lobby-domain event listeners on a socket.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function register(io, socket) {
  const user = socket.user;
  let lastOnlineSearchAt = 0;
  let lastRoomsQueryAt = 0;

  socket.on('lobby:subscribe', (payload) => {
    // #439: one room page per rule tab; a tab switch re-subscribes. No / unknown rule = every rule.
    const channel = lobbyChannelOf(payload && typeof payload === 'object' ? payload.rule : undefined);
    leaveLobby(socket);
    socket.join(LOBBY_ROOM);
    socket.join(lobbyRoomOf(channel));
    // Full snapshot first — every later broadcast is only a delta against it,
    // so a client that joins mid-stream has nothing to apply patches to
    // until it has received this.
    sendLobbySnapshot(io, socket, channel);
    sendOnlineSnapshot(io, socket); // #230: then lobby:online_patch deltas
  });

  // #381: the snapshot carries one page of the online list; search / "is this user online" is on demand.
  socket.on('lobby:online_query', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const query = payload && typeof payload === 'object' ? payload : {};
    // A name search walks the whole online list; the client debounces at 250 ms, so anything
    // faster than this is not typing. The id lookup is O(ids) and is not throttled.
    if (!Array.isArray(query.ids)) {
      const now = Date.now();
      if (now - lastOnlineSearchAt < ONLINE_SEARCH_MIN_INTERVAL_MS) { ack({ error: 'RATE_LIMITED' }); return; }
      lastOnlineSearchAt = now;
    }
    ack(queryOnlineUsers(query));
  });

  // #382: the lobby mirrors one page of rooms; "show more" fetches the next page of the ranking.
  // #439: per rule, with filters/sort ({rule, offset, open, time, near, sort}); `near` uses the asker's Elo.
  socket.on('lobby:rooms_query', (payload, ack) => {
    if (typeof ack !== 'function') return;
    const now = Date.now();
    // Ranks every room: same throttle as the name search above (a click, not a stream).
    if (now - lastRoomsQueryAt < ONLINE_SEARCH_MIN_INTERVAL_MS) { ack({ error: 'RATE_LIMITED' }); return; }
    lastRoomsQueryAt = now;
    ack(queryLobbyRooms(payload && typeof payload === 'object' ? payload : {}, user));
  });

  // #438: "Báo khi có bàn" — arm / replace ({rule, near, time[]}) or clear (no payload) this socket's seat alert.
  // Independent of lobby:subscribe: it works from any page that holds a socket.
  socket.on('lobby:alert_set', (payload, ack) => {
    const armed = setSeatAlert(socket, payload);
    if (typeof ack === 'function') ack({ ok: true, armed });
  });
  socket.on('lobby:alert_clear', () => { clearSeatAlert(socket); });

  socket.on('lobby:unsubscribe', () => {
    leaveLobby(socket);
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
      socket.emit('room:error', { message: result.error, code: result.code });
      return;
    }

    const room = result.room;
    // F402: the create-room modal pre-fills with these next time. Members only (guests have no
    // users row); best-effort — a failed write must never fail the room that was just created.
    if (!user.isGuest) {
      try { database.setLastRoomSettings(user.userId, room.settings); }
      catch (err) { logger.warn('[Lobby] could not remember room settings', { err: err.message }); }
    }
    leaveLobby(socket);
    socket.join(room.roomId);
    (socket.data || (socket.data = {})).roomPageId = room.roomId; // #373: this socket is the room page (RoomHandler onPresence reads it)
    socket.emit('room:joined', roomManager.serializeRoom(room));
    broadcastLobbyUpdate(io, room.roomId);
  });

  socket.on('room:join', (payload = {}) => {
    if (!payload.roomId) {
      socket.emit('room:error', { message: 'Thiếu mã phòng.', code: 'MISSING_ROOM_ID' });
      return;
    }

    const result = roomManager.joinRoom(
      { userId: user.userId, displayName: user.displayName, isGuest: user.isGuest },
      payload.roomId
    );

    if (result.error) {
      socket.emit('room:error', { message: result.error, code: result.code });
      return;
    }

    const room = result.room;
    leaveLobby(socket);
    socket.join(room.roomId);
    // #373: the room page itself asked — a returning member (reload, back from another page) is watching
    // again, even if a non-room page had marked them away or their old socket left them 'disconnected'.
    (socket.data || (socket.data = {})).roomPageId = room.roomId;
    const me = room.users && room.users.get(user.userId);
    if (me) me.presence = 'active';

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
    broadcastLobbyUpdate(io, room.roomId);

    io.to(room.roomId).emit('chat:message', {
      from: null, fromId: null,
      text: `${user.displayName} đã vào phòng.`,
      code: 'ROOM_PLAYER_JOINED', vars: { name: user.displayName },
      timestamp: Date.now(), isSystem: true,
    });
  });
}

module.exports = { register };
