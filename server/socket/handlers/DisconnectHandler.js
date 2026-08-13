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
  emptyRoomGraceTimers,
  spectatorGraceTimers,
  broadcastLobbyUpdate,
  broadcastRoomUpdate,
  cleanupRoomTimer,
  cleanupReadyTimer,
  findSocketsByUserId,
  clearReadyState,
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

  // If this disconnecting user is the room's only occupant, destroying the
  // room outright would punish the extremely common case of a full-page
  // navigation (e.g. index.html -> room.html right after room:create) rather
  // than a real abandonment — see EMPTY_ROOM_GRACE_MS in config.js. Give them
  // a bounded window to reconnect before actually leaving/destroying.
  if (room.users.size === 1) {
    startEmptyRoomGrace(io, room, user);
    return;
  }

  // Guest/spectator, or a seated player whose game isn't 'ongoing' yet, with
  // other people still in the room: give them a bounded window to reconnect
  // too, instead of evicting them the instant the socket drops. Without this,
  // a brief network blip (screen lock, wifi handoff) permanently removed them
  // from room.users/userRoomMap, and their reconnect then hit the "room no
  // longer exists" branch in SocketHandler.js even though the room was still
  // alive with the other occupant(s) in it. See TODO.md #39 / instruction.md §39.
  startSpectatorGrace(io, room, user);
}

/**
 * Apply the result of roomManager.leaveRoom() — used both for an immediate
 * disconnect and for a grace-expiry leave (see startEmptyRoomGrace below).
 *
 * @param {import('socket.io').Server} io
 * @param {string} roomId
 * @param {{ userId: string, displayName: string }} user
 * @param {{ room: object|null, destroyed: boolean, hostTransferred: boolean }} result
 */
function finalizeNormalLeave(io, roomId, user, result) {
  if (result.destroyed) {
    cleanupRoomTimer(roomId);
    cleanupReadyTimer(roomId);
    broadcastLobbyUpdate(io);
  } else if (result.room) {
    // Leaving a seat mid ready-window frees it — roomManager.leaveRoom()
    // already reset the pair's ready state; this just cancels the socket-side
    // countdown timer to match.
    clearReadyState(io, result.room);
    broadcastRoomUpdate(io, result.room);
    io.to(roomId).emit('chat:message', {
      from: null, fromId: null,
      text: `${user.displayName} đã mất kết nối.`,
      code: 'PLAYER_DISCONNECTED', vars: { name: user.displayName },
      timestamp: Date.now(), isSystem: true,
    });
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
}

/**
 * Start a bounded grace period for a room that just became solely occupied
 * by the disconnecting user, instead of destroying it immediately. Cancelled
 * by cancelEmptyRoomGrace() if that same user reconnects in time — see the
 * call site in SocketHandler.js's connection handler, which runs before the
 * existing auto-rejoin (getRoomByUser) check, so a reconnect within the
 * window finds the room still there.
 *
 * @param {import('socket.io').Server} io
 * @param {object} room
 * @param {{ userId: string, displayName: string }} user
 */
function startEmptyRoomGrace(io, room, user) {
  const roomId = room.roomId;
  const graceSec = Math.floor(config.EMPTY_ROOM_GRACE_MS / 1000);

  const existing = emptyRoomGraceTimers.get(user.userId);
  if (existing) clearTimeout(existing.timeout);

  const roomUser = room.users.get(user.userId);
  if (roomUser) {
    roomUser.presence = 'disconnected';
    broadcastRoomUpdate(io, room);
  }

  const timeout = setTimeout(() => {
    emptyRoomGraceTimers.delete(user.userId);
    finalizeNormalLeave(io, roomId, user, roomManager.leaveRoom(user.userId));
    logger.info(`[Disconnect] Empty-room grace expired for ${user.displayName}, room ${roomId} — left for real`);
  }, config.EMPTY_ROOM_GRACE_MS);

  emptyRoomGraceTimers.set(user.userId, { timeout, roomId });
  logger.info(`[Disconnect] Empty-room grace started for ${user.displayName} in room ${roomId} (${graceSec}s)`);
}

/**
 * Cancel a pending empty-room grace timer for a user. Called on every new
 * connection (see SocketHandler.js), before the existing room-rejoin check
 * runs, so a returning socket finds the room still intact. No-op if none
 * was pending.
 *
 * @param {string} userId
 * @returns {boolean} true if a grace timer was cancelled
 */
function cancelEmptyRoomGrace(userId) {
  const entry = emptyRoomGraceTimers.get(userId);
  if (!entry) return false;
  clearTimeout(entry.timeout);
  emptyRoomGraceTimers.delete(userId);
  logger.info(`[Disconnect] Empty-room grace cancelled for ${userId} — reconnected in time`);
  return true;
}

/**
 * Start a bounded grace period for a guest/spectator (or a seated player
 * whose game isn't 'ongoing' yet) who just disconnected while other people
 * remain in the room — the gap left uncovered between startEmptyRoomGrace
 * (sole occupant) and startDisconnectGrace (player in an ongoing game).
 * Cancelled by cancelSpectatorGrace() if the same user reconnects in time —
 * see the call site in SocketHandler.js, which runs before the existing
 * auto-rejoin (getRoomByUser) check, so a reconnect within the window finds
 * the room and the user's seat/membership still there.
 *
 * @param {import('socket.io').Server} io
 * @param {object} room
 * @param {{ userId: string, displayName: string }} user
 */
function startSpectatorGrace(io, room, user) {
  const roomId = room.roomId;
  const graceSec = Math.floor(config.SPECTATOR_GRACE_MS / 1000);

  const existing = spectatorGraceTimers.get(user.userId);
  if (existing) clearTimeout(existing.timeout);

  const roomUser = room.users.get(user.userId);
  if (roomUser) {
    roomUser.presence = 'disconnected';
    broadcastRoomUpdate(io, room);
  }

  const timeout = setTimeout(() => {
    spectatorGraceTimers.delete(user.userId);
    finalizeNormalLeave(io, roomId, user, roomManager.leaveRoom(user.userId));
    logger.info(`[Disconnect] Spectator grace expired for ${user.displayName}, room ${roomId} — left for real`);
  }, config.SPECTATOR_GRACE_MS);

  spectatorGraceTimers.set(user.userId, { timeout, roomId });
  logger.info(`[Disconnect] Spectator grace started for ${user.displayName} in room ${roomId} (${graceSec}s)`);
}

/**
 * Cancel a pending spectator grace timer for a user. Called on every new
 * connection (see SocketHandler.js), before the existing room-rejoin check
 * runs, so a returning socket finds the room and their membership intact.
 * No-op if none was pending.
 *
 * @param {string} userId
 * @returns {boolean} true if a grace timer was cancelled
 */
function cancelSpectatorGrace(userId) {
  const entry = spectatorGraceTimers.get(userId);
  if (!entry) return false;
  clearTimeout(entry.timeout);
  spectatorGraceTimers.delete(userId);
  logger.info(`[Disconnect] Spectator grace cancelled for ${userId} — reconnected in time`);
  return true;
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
  if (timer) {
    timer.stop();
    // Tell clients to stop their local countdown — with no per-second ticks,
    // silence would otherwise let their clocks keep running while the real
    // one is paused.
    io.to(roomId).emit('timer:sync', timer.getSync());
  }

  room.state = 'interrupted';

  const roomUser = room.users.get(user.userId);
  if (roomUser) roomUser.presence = 'disconnected';

  // No server-side chat:message here — the client's own game:interrupted
  // handler (room-socket.js) already shows this same announcement via
  // ChatUI.appendSystemMessage(t('room.disconnected', ...)) + a toast.
  // Emitting both produced two near-identical lines in the chat panel for
  // one event (TODO #47).
  io.to(roomId).emit('game:interrupted', {
    playerId: user.userId,
    playerName: user.displayName,
    secondsLeft: graceSec,
  });
  broadcastRoomUpdate(io, room);

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
        code: 'PLAYER_DISCONNECT_TIMEOUT', vars: { name: user.displayName },
        timestamp: Date.now(), isSystem: true,
      });
    }

    const result = roomManager.leaveRoom(user.userId);
    if (result.destroyed) cleanupRoomTimer(roomId);
    else if (result.room) broadcastRoomUpdate(io, result.room);
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

  const room = roomManager.getRoom(entry.roomId);
  if (!room || !room.gameState) return false;

  // Defense in depth: kickUser() already refuses to remove someone while
  // room.state === 'interrupted', but if membership was lost some other way,
  // don't let a non-member rejoin the room socket or resume the game.
  if (!room.users.has(user.userId)) return false;

  // Only now tear the grace timer down. Doing this above the two checks meant
  // an early return left the game with nothing to end it: the timeout that
  // would have called handleGameEnd was already cleared and its entry gone, so
  // the room sat in 'interrupted' forever — and _idleCleanup deliberately
  // skips rooms in that state, so nothing else would ever collect it. Bailing
  // out before this point now leaves the grace period running, exactly as if
  // the player had never reconnected.
  //
  // It must also stay ABOVE the otherStillAway scan below, which asks whether
  // anyone *else* from this room is still in grace: with this entry still in
  // the map, that scan would always find the reconnecting player themselves
  // and the game would never resume.
  clearTimeout(entry.timeout);
  clearInterval(entry.countdown);
  disconnectTimers.delete(user.userId);

  const roomUser = room.users.get(user.userId);
  if (roomUser) roomUser.presence = 'active';

  socket.join(entry.roomId);

  // If another player of this room is still within their own grace window,
  // let this player back in to see the board, but don't resume the clock —
  // resuming here would run out the timer on the still-absent player's turn
  // even though their own grace window hasn't expired yet.
  const otherStillAway = [...disconnectTimers.values()].some(e => e.roomId === entry.roomId);
  if (otherStillAway) {
    socket.emit('game:init', {
      ...room.gameState.serialize(),
      timer: null,
    });
    io.to(entry.roomId).emit('chat:message', {
      from: null, fromId: null,
      text: `${user.displayName} đã kết nối lại, đang chờ đối thủ...`,
      code: 'PLAYER_RECONNECTED_WAITING', vars: { name: user.displayName },
      timestamp: Date.now(), isSystem: true,
    });
    logger.info(`[Disconnect] ${user.displayName} reconnected to room ${entry.roomId} but another player is still in grace — not resuming yet`);
    broadcastRoomUpdate(io, room);
    return true;
  }

  room.state = 'playing';

  const timer = timerMap.get(entry.roomId);
  if (timer) {
    timer.start();
    io.to(entry.roomId).emit('timer:sync', timer.getSync());
  }

  // No server-side chat:message here either — the client's game:resumed
  // handler already shows ChatUI.appendSystemMessage(t('room.reconnected'))
  // + a toast. See the matching comment in startDisconnectGrace (TODO #47).
  io.to(entry.roomId).emit('game:resumed', { playerId: user.userId });
  socket.emit('game:init', {
    ...room.gameState.serialize(),
    timer: timer ? timer.getTimers() : null,
    timerSync: timer ? timer.getSync() : null,
  });
  broadcastRoomUpdate(io, room);

  logger.info(`[Disconnect] ${user.displayName} reconnected, game resumed in room ${entry.roomId}`);
  return true;
}

module.exports = { handleDisconnect, cancelDisconnectGrace, cancelEmptyRoomGrace, cancelSpectatorGrace };
