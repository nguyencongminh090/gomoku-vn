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
const presenceCore = require('../../presence/presence-core');
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
  sessions,
} = require('../state');
const { handleGameEnd } = require('./GameHandler');
const abandonment = require('../../managers/AbandonmentService');
const fairPlay = require('../../managers/FairPlayPresence');

// ── Rated games: absence inside a running game (#493, features/presence-status §3) ──────────────────
// Casual games keep the pause-and-wait grace below. A rated game keeps running: the absent player's clock
// runs as at a real board, and an absence budget W (per game, never refilled) is spent only on their own
// turn. W out → they lose ('abandon'). Before each player has acted → abort (void) after ABORT_MS. Both
// players gone BOTH_GONE_MS → void. During a site-wide outage (many sockets dropping at once, Q13) an
// absent player's abandonment or clock loss is voided instead.
const ABORT_MS = 30_000;
const BOTH_GONE_MS = 15_000;
const ABSENCE_POLL_MS = 1_000;
// min/share count MEMBERS only (guest tabs are free to open); pairGapMs = both seats of a game must drop this close
// together; maxMs caps how long a burst of drops can keep the window open (security review of #493).
const OUTAGE = { windowMs: 5_000, share: 0.3, min: 6, holdMs: 120_000, pairGapMs: 15_000, maxMs: 300_000 };

/** Absence budget W for a room's time control (Chess.com-style, clamped 30-120 s; per_move = one move). */
function absenceWindowMs(settings) {
  const s = settings || {};
  const base = Number(s.timerSeconds) || 0;
  if (s.timerMode === 'per_move') return Math.max(1, base) * 1000;
  const inc = s.timerMode === 'blitz' ? Number(s.timerIncrementSeconds) || 0 : 0;
  return Math.round(Math.min(120, Math.max(30, 0.1 * (base + 40 * inc))) * 1000);
}

/** A rated game (engine stubs without isRated, e.g. older tests, count as casual). */
function isRatedEngine(engine) {
  return !!engine && typeof engine.isRated === 'function' && engine.isRated() === true;
}

// Outage detection counts DISTINCT MEMBERS (one flapping account counts once; guest tabs do not count), and a
// void additionally needs BOTH players of the game to have dropped inside the outage, within pairGapMs of each
// other: one player cannot turn their own abandonment into a void by dropping sockets of their own (security
// review of #493). A real tunnel/network blip drops both seats of a game together.
const _winQ = [];            // { uid, at } inside OUTAGE.windowMs, oldest first
const _winCount = new Map(); // uid → occurrences in _winQ (distinct-user count = its size)
const _lastDrop = new Map(); // uid → last drop time, kept for windowMs + holdMs, oldest first
let _outageFrom = 0;
let _outageStart = 0;
let _outageUntil = 0;
/** Count a real drop (not an evicted tab); open the outage window when many distinct users drop together. */
function noteDrop(uid, isGuest, now = Date.now()) {
  if (!isGuest) {
    _winQ.push({ uid, at: now });
    _winCount.set(uid, (_winCount.get(uid) || 0) + 1);
  }
  while (_winQ.length && now - _winQ[0].at > OUTAGE.windowMs) {
    const e = _winQ.shift();
    const c = _winCount.get(e.uid) - 1;
    if (c > 0) _winCount.set(e.uid, c); else _winCount.delete(e.uid);
  }
  _lastDrop.delete(uid);
  _lastDrop.set(uid, now);
  for (const [id, t] of _lastDrop) { if (now - t <= OUTAGE.windowMs + OUTAGE.holdMs) break; _lastDrop.delete(id); }
  const n = _winCount.size;
  const live = (sessions ? sessions.size : 0) + n; // each drop already left `sessions`
  if (n >= OUTAGE.min && n >= OUTAGE.share * live) {
    if (now >= _outageUntil) { _outageStart = now; _outageFrom = now - OUTAGE.windowMs; } // a new outage
    if (now - _outageStart <= OUTAGE.maxMs) _outageUntil = Math.min(now + OUTAGE.holdMs, _outageStart + OUTAGE.maxMs);
  }
}
function inOutage(now = Date.now()) { return now < _outageUntil; }
/** An outage is open and every listed player dropped inside it. */
function outageCovers(userIds, now = Date.now()) {
  if (!inOutage(now)) return false;
  const at = userIds.map((id) => _lastDrop.get(id) || 0);
  if (at.some((t) => t < _outageFrom)) return false;
  return Math.max(...at) - Math.min(...at) <= OUTAGE.pairGapMs;
}
/** Tests only. */
function _resetOutage() { _winQ.length = 0; _winCount.clear(); _lastDrop.clear(); _outageFrom = 0; _outageStart = 0; _outageUntil = 0; }

/** The game's absence bookkeeping (budget left per player, who was absent when it ended — #495 reads it). */
function absenceOf(engine) {
  if (!engine.absence) engine.absence = { left: {}, absentAtEnd: [] };
  return engine.absence;
}

function isAbortable(engine) {
  return !(engine.actedBy && engine.players.every((p) => engine.actedBy.has(p.userId)));
}

/**
 * GameHandler's clock-timeout path asks this (lazy require): during an outage, a player who is absent
 * when their clock runs out is not charged with the loss (Q13, pre-mortem: tunnel blips).
 */
function voidsClockTimeout(roomId, userId) {
  const e = disconnectTimers.get(userId);
  if (!e || e.kind !== 'absence' || e.roomId !== roomId) return false;
  const room = roomManager.getRoom(roomId);
  const ids = room && room.gameState ? room.gameState.players.map((p) => p.userId) : [userId];
  return outageCovers(ids);
}

function startAbsence(io, room, user) {
  const roomId = room.roomId;
  const engine = room.gameState;
  const uid = user.userId;
  const now = Date.now();
  const roomUser = room.users.get(uid);
  if (roomUser) roomUser.presence = 'disconnected';
  const ab = absenceOf(engine);
  // #495: a repeat leaver (>= 3 abandons/aborts in 24 h) gets half the budget (floor 15 s).
  if (typeof ab.left[uid] !== 'number') ab.left[uid] = abandonment.budgetFor(uid, absenceWindowMs(room.settings), now);
  const abortable = isAbortable(engine);
  const entry = {
    kind: 'absence', roomId, since: now, last: now,
    abortAt: abortable ? now + ABORT_MS : null,
    until: null, countdown: null, timeout: null,
  };
  entry.until = abortable ? entry.abortAt : engine.currentTurn === uid ? now + ab.left[uid] : null;
  entry.countdown = setInterval(() => absenceTick(io, roomId, user), ABSENCE_POLL_MS);
  if (typeof entry.countdown.unref === 'function') entry.countdown.unref();
  disconnectTimers.set(uid, entry);
  fairPlay.onDisconnect(engine, uid, now); // #496
  // No clock change (it keeps running), so no timerSync: one event, then the seat's room:updated.
  io.to(roomId).emit('game:absent', { playerId: uid, playerName: user.displayName, abortable });
  broadcastRoomUpdate(io, room);
  logger.debug(`[Disconnect] Rated absence started for ${user.displayName} in room ${roomId} (budget ${ab.left[uid]} ms, abortable ${abortable})`);
}

/** Stop one absence entry (its interval) and forget it. */
function clearAbsence(uid) {
  const e = disconnectTimers.get(uid);
  if (!e || e.kind !== 'absence') return null;
  clearInterval(e.countdown);
  disconnectTimers.delete(uid);
  return e;
}

/** Vietnamese fallback text for the system chat line (clients translate by code: sys.<code>). */
const ABSENCE_TEXT = {
  PLAYER_ABANDONED: (n) => `${n} không quay lại. Xử thua vì bỏ ván.`,
  GAME_ABORTED_ABSENT: (n) => `${n} không quay lại khi một bên chưa kịp đi nước nào. Ván đấu huỷ, không ghi điểm.`,
  GAME_BOTH_ABSENT: () => 'Cả hai người chơi đều mất kết nối. Ván đấu huỷ, không ghi điểm.',
  GAME_OUTAGE_VOID: () => 'Kết nối tới máy chủ gián đoạn. Ván đấu huỷ, không ghi điểm.',
};

/** End a rated game because of absence; exactly one ending (callers checked status === 'ongoing'). */
function endByAbsence(io, room, { winner, reason, voided, code, name }) {
  const engine = room.gameState;
  const roomId = room.roomId;
  engine.status = 'finished';
  engine.result = { winner, reason };
  const ab = absenceOf(engine);
  ab.absentAtEnd = engine.players.map((p) => p.userId).filter((id) => {
    const e = disconnectTimers.get(id);
    return e && e.kind === 'absence' && e.roomId === roomId;
  });
  handleGameEnd(io, room, voided ? { noScore: true } : {});
  // #495: the players who left are charged for an abandonment or an abort — never for outage / both-gone voids.
  if (reason === 'abandon' || reason === 'abort') {
    for (const id of ab.absentAtEnd) abandonment.record(id, engine.gameId, reason);
  }
  io.to(roomId).emit('game:ended', { result: engine.result, scoreTable: room.scoreTable, scoreHistory: room.scoreHistory || [] });
  io.to(roomId).emit('chat:message', {
    from: null, fromId: null, text: ABSENCE_TEXT[code](name), code, vars: { name },
    timestamp: Date.now(), isSystem: true,
  });
  // The absent seats lapse now, as the old grace expiry did (#367: they stay in the room as viewers).
  for (const id of ab.absentAtEnd) {
    clearAbsence(id);
    const u = room.users.get(id);
    finalizeSeatRelease(io, roomId, { userId: id, displayName: u ? u.displayName : '—' }, roomManager.releaseSeat(id));
  }
  reapGhostRoom(io, roomId);
}

function absenceTick(io, roomId, user) {
  const uid = user.userId;
  const entry = disconnectTimers.get(uid);
  if (!entry || entry.kind !== 'absence' || entry.roomId !== roomId) return; // cleared elsewhere
  const now = Date.now();
  const dt = Math.max(0, now - entry.last); // real elapsed time: throttled intervals do not drift
  entry.last = now;
  const room = roomManager.getRoom(roomId);
  const engine = room && room.gameState;
  if (!room || !engine || engine.status !== 'ongoing') {
    // The game ended another way (clock, resign, draw…) while they were away: hand the seat to the normal
    // seat grace, so a disconnected player never stays seated forever.
    clearAbsence(uid);
    if (room && room.users.has(uid)) startSpectatorGrace(io, room, user);
    return;
  }
  const ab = absenceOf(engine);
  const other = engine.players.find((p) => p.userId !== uid);
  const oe = other && disconnectTimers.get(other.userId);
  if (oe && oe.kind === 'absence' && oe.roomId === roomId && now - Math.max(entry.since, oe.since) >= BOTH_GONE_MS) {
    endByAbsence(io, room, { winner: null, reason: 'both_absent', voided: true, code: 'GAME_BOTH_ABSENT', name: user.displayName });
    return;
  }
  if (entry.abortAt !== null) {
    if (!isAbortable(engine)) { // the other player acted meanwhile: from now on it is a normal absence
      entry.abortAt = null;
    } else {
      if (now >= entry.abortAt) {
        endByAbsence(io, room, { winner: null, reason: 'abort', voided: true, code: 'GAME_ABORTED_ABSENT', name: user.displayName });
      }
      return;
    }
  }
  if (engine.currentTurn !== uid) {
    if (entry.until !== null) { entry.until = null; broadcastRoomUpdate(io, room); }
    return;
  }
  ab.left[uid] = Math.max(0, ab.left[uid] - dt);
  const until = now + ab.left[uid];
  if (entry.until === null) { entry.until = until; broadcastRoomUpdate(io, room); } // the turn reached them: one update
  else entry.until = until;
  if (ab.left[uid] > 0) return;
  if (outageCovers(engine.players.map((p) => p.userId), now)) {
    endByAbsence(io, room, { winner: null, reason: 'disconnect', voided: true, code: 'GAME_OUTAGE_VOID', name: user.displayName });
  } else {
    endByAbsence(io, room, { winner: other ? other.userId : null, reason: 'abandon', voided: false, code: 'PLAYER_ABANDONED', name: user.displayName });
  }
}

/** The absent player is back on the room page: the game simply goes on (it never paused). */
function returnFromAbsence(io, socket, entry, room) {
  const uid = socket.user.userId;
  const engine = room.gameState;
  if (engine.status === 'ongoing' && entry.abortAt === null && engine.currentTurn === uid) {
    const ab = absenceOf(engine);
    ab.left[uid] = Math.max(0, ab.left[uid] - Math.max(0, Date.now() - entry.last)); // Q2: not refilled
  }
  clearAbsence(uid);
  fairPlay.onReturn(engine, uid); // #496
  if (engine.status !== 'ongoing') return false; // ended in between: the normal rejoin path takes over
  const roomUser = room.users.get(uid);
  if (roomUser) roomUser.presence = 'active';
  socket.join(entry.roomId);
  const timer = timerMap.get(entry.roomId);
  const timerSync = timer ? timer.getSync() : null;
  // game:resumed already means "back, clock as given" to every client; game:init rebuilds the returner.
  socket.to(entry.roomId).emit('game:resumed', { playerId: uid, timerSync });
  socket.emit('game:init', { ...engine.serialize(), timer: timer ? timer.getTimers() : null, timerSync });
  broadcastRoomUpdate(io, room);
  logger.debug(`[Disconnect] ${socket.user.displayName} back in rated game ${entry.roomId}`);
  return true;
}

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
  // #493 Q13: SocketHandler already removed this socket from `sessions` if it was the live one; an
  // evicted tab (a newer socket took over) is not a drop.
  if (sessions && !sessions.has(user.userId)) noteDrop(user.userId, !!user.isGuest || String(user.userId).startsWith('guest_'));
  const roomId = roomManager.getRoomIdByUser(user.userId);
  if (!roomId) return;

  const room = roomManager.getRoom(roomId);

  // RACE CONDITION FIX: if the user still has another active socket (e.g. duplicate tab),
  // skip leave / grace — only the last connection should trigger cleanup.
  const activeSockets = findSocketsByUserId(io, user.userId);
  if (activeSockets.length > 0) {
    logger.debug(`[Disconnect] Stale socket closed for ${user.displayName}, active socket exists — skipping`);
    return;
  }

  // #422: already in this room's in-game grace — this socket never resumed the game (e.g. the lobby
  // page Back landed on, now bouncing into the room). Keep the running window: restarting it would
  // re-interrupt the opponent and let page bounces extend the grace forever.
  const pending = disconnectTimers.get(user.userId);
  if (pending && pending.roomId === roomId) return;

  // Start grace period if player is in an active game
  if (room && room.gameState && room.gameState.status === 'ongoing') {
    const isPlayer = room.gameState.players.some(p => p.userId === user.userId);
    if (isPlayer) {
      if (isRatedEngine(room.gameState)) startAbsence(io, room, user); // #493: the game keeps running
      else startDisconnectGrace(io, room, user);
      return;
    }
  }

  // If this disconnecting user is the room's only occupant, destroying the
  // room outright would punish the extremely common case of a full-page
  // navigation (e.g. index.html -> room.html right after room:create) rather
  // than a real abandonment — see EMPTY_ROOM_GRACE_MS in config.js. Give them
  // a bounded window to reconnect before actually leaving/destroying.
  // "Only occupant" means only *connected* one: occupants already marked
  // 'disconnected' (ghost viewers, users in their own grace) don't keep the
  // room alive — counting them left a room of ghosts alive until the 10-min
  // idle sweep (TODO.md #186).
  if (!hasOtherConnectedUser(room, user.userId)) {
    startEmptyRoomGrace(io, room, user);
    return;
  }

  // A seated player whose game isn't 'ongoing' yet, with other people still
  // in the room: give them a bounded window to reconnect too, instead of
  // evicting them the instant the socket drops. Without this, a brief
  // network blip (screen lock, wifi handoff) permanently removed them from
  // room.users/userRoomMap, and their reconnect then hit the "room no longer
  // exists" branch in SocketHandler.js even though the room was still alive
  // with the other occupant(s) in it. See TODO.md #39 / instruction.md §39.
  //
  // A real viewer (slot === null, never sat down) instead gets no timeout at
  // all: mark them disconnected and leave them in room.users indefinitely —
  // RoomManager.joinRoom() already treats "still in room.users" as a valid
  // reconnect regardless of elapsed time, so they can rejoin the same room
  // whenever they come back, as long as the room itself hasn't been
  // destroyed (ROOM_GONE otherwise). See TODO.md #115 / instruction.md §115.
  const roomUser = room.users.get(user.userId);
  if (roomUser && roomUser.slot === null) {
    roomUser.presence = 'disconnected';
    broadcastRoomUpdate(io, room);
    logger.debug(`[Disconnect] Viewer ${user.displayName} disconnected in room ${roomId} — no grace timeout, stays in room.users indefinitely`);
    return;
  }

  startSpectatorGrace(io, room, user);
}

/** True if anyone other than `userId` in the room is still connected. */
function hasOtherConnectedUser(room, userId) {
  for (const [id, u] of room.users) {
    if (id !== userId && presenceCore.isConnectedMember(u)) return true;
  }
  return false;
}

/**
 * After a grace-expiry leave: if nobody left in the room is connected and none
 * of them is still inside a grace window, the rest are ghost viewers (#115:
 * no timeout of their own) — remove them so the room is destroyed instead of
 * lingering in the lobby and holding its creator's room quota (TODO.md #186).
 * A ghost viewer who comes back later gets ROOM_GONE, as for any closed room.
 *
 * @param {import('socket.io').Server} io
 * @param {string} roomId
 */
function reapGhostRoom(io, roomId) {
  const room = roomManager.getRoom(roomId);
  if (!room || !room.users || room.users.size === 0) return;
  if (room.gameState && room.gameState.status === 'ongoing') return;
  for (const [id, u] of room.users) {
    if (presenceCore.isConnectedMember(u)) return;
    if (emptyRoomGraceTimers.has(id) || spectatorGraceTimers.has(id) || disconnectTimers.has(id)) return;
  }
  for (const [id, u] of [...room.users]) {
    finalizeNormalLeave(io, roomId, u, roomManager.leaveRoom(id));
  }
  logger.debug(`[Disconnect] Room ${roomId}: only disconnected viewers left — removed them`);
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
    broadcastLobbyUpdate(io, roomId);
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
    broadcastLobbyUpdate(io, roomId);
  }
}

/**
 * Apply the result of roomManager.releaseSeat() after a grace window ran out
 * (#367): the user stays in room.users as a disconnected viewer.
 *
 * @param {import('socket.io').Server} io
 * @param {string} roomId
 * @param {{ userId: string, displayName: string }} user
 * @param {{ room: object|null, wasSeated: boolean, hostTransferred: boolean }} result
 */
function finalizeSeatRelease(io, roomId, user, result) {
  if (!result || !result.room) return;
  const room = result.room;
  clearReadyState(io, room);
  broadcastRoomUpdate(io, room);
  if (result.wasSeated) {
    io.to(roomId).emit('chat:message', {
      from: null, fromId: null,
      text: `${user.displayName} đã mất kết nối.`,
      code: 'PLAYER_DISCONNECTED', vars: { name: user.displayName },
      timestamp: Date.now(), isSystem: true,
    });
  }
  if (result.hostTransferred) {
    const newHost = room.users.get(room.host);
    io.to(roomId).emit('chat:message', {
      from: null, fromId: null,
      text: `${newHost ? newHost.displayName : '—'} là chủ phòng mới.`,
      code: 'ROOM_NEW_HOST', vars: { name: newHost ? newHost.displayName : '—' },
      timestamp: Date.now(), isSystem: true,
    });
  }
  broadcastLobbyUpdate(io, roomId);
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
    const result = roomManager.leaveRoom(user.userId);
    finalizeNormalLeave(io, roomId, user, result);
    logger.info(`[Disconnect] Empty-room grace expired for ${user.displayName}, room ${roomId} — left for real`);
    if (result && !result.destroyed && result.room) reapGhostRoom(io, roomId);
  }, config.EMPTY_ROOM_GRACE_MS);

  emptyRoomGraceTimers.set(user.userId, { timeout, roomId, until: Date.now() + config.EMPTY_ROOM_GRACE_MS });
  logger.debug(`[Disconnect] Empty-room grace started for ${user.displayName} in room ${roomId} (${graceSec}s)`);
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
  logger.debug(`[Disconnect] Empty-room grace cancelled for ${userId} — reconnected in time`);
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
    // #367: free the seat, keep the user in the room — their late reconnect auto-rejoins.
    finalizeSeatRelease(io, roomId, user, roomManager.releaseSeat(user.userId));
    logger.info(`[Disconnect] Spectator grace expired for ${user.displayName}, room ${roomId} — seat released, stays as viewer`);
    reapGhostRoom(io, roomId);
  }, config.SPECTATOR_GRACE_MS);

  spectatorGraceTimers.set(user.userId, { timeout, roomId, until: Date.now() + config.SPECTATOR_GRACE_MS });
  logger.debug(`[Disconnect] Spectator grace started for ${user.displayName} in room ${roomId} (${graceSec}s)`);
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
  logger.debug(`[Disconnect] Spectator grace cancelled for ${userId} — reconnected in time`);
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
  // #494 (Q3 A): one cumulative grace budget per player per game — returning does not refill it, so
  // repeated drops cannot buy unlimited paused thinking time (problem 2 for casual games).
  const ab = room.gameState ? absenceOf(room.gameState) : null;
  if (ab && typeof ab.left[user.userId] !== 'number') ab.left[user.userId] = config.DISCONNECT_GRACE_MS;
  const budgetMs = ab ? Math.max(0, ab.left[user.userId]) : config.DISCONNECT_GRACE_MS;
  const graceSec = Math.ceil(budgetMs / 1000);

  // Clear any existing stale grace timer for this user
  const existing = disconnectTimers.get(user.userId);
  if (existing) {
    clearTimeout(existing.timeout);
    clearInterval(existing.countdown);
    disconnectTimers.delete(user.userId);
    logger.debug(`[Disconnect] Cleared stale grace timer for ${user.displayName}`);
  }

  // Pause the game timer
  // The paused clock rides on game:interrupted below (#398: one emit, not a separate timer:sync) —
  // clients must stop their local countdown or it keeps running while the real one is paused.
  const timer = timerMap.get(roomId);
  if (timer) timer.stop();

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
    timerSync: timer ? timer.getSync() : null,
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
        scoreHistory: room.scoreHistory || [],
      });
      io.to(roomId).emit('chat:message', {
        from: null, fromId: null,
        text: `${user.displayName} không kết nối lại. Ván đấu huỷ, không ghi điểm.`,
        code: 'PLAYER_DISCONNECT_TIMEOUT', vars: { name: user.displayName },
        timestamp: Date.now(), isSystem: true,
      });
    }

    // #367: the game is over for them, but they stay in the room as a viewer so a
    // reconnect after the window still lands back here instead of on ROOM_GONE.
    finalizeSeatRelease(io, roomId, user, roomManager.releaseSeat(user.userId));
    logger.info(`[Disconnect] Grace expired for ${user.displayName}, room ${roomId} — seat released, stays as viewer`);
    reapGhostRoom(io, roomId);
  }, budgetMs);

  const since = Date.now();
  disconnectTimers.set(user.userId, { timeout, countdown, roomId, since, until: since + budgetMs });
  logger.debug(`[Disconnect] Grace period started for ${user.displayName} in room ${roomId}`);
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

  // #497: this socket resumes the game, so it is the room page (#422 keeps non-room pages out of here). Mark it
  // as such (#373 roomPageId), or its next presence report reads as "on another page" and shows the player away.
  const auth = (socket.handshake && socket.handshake.auth) || {};
  if (auth.roomPage === true || auth.roomId === entry.roomId) (socket.data || (socket.data = {})).roomPageId = entry.roomId;

  // #493: a rated game never paused — the returner just rejoins it (no waiting for the other player).
  if (entry.kind === 'absence') return returnFromAbsence(io, socket, entry, room);

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

  // #494: spend the time this drop used from the player's per-game grace budget.
  if (typeof entry.since === 'number') {
    const ab = absenceOf(room.gameState);
    if (typeof ab.left[user.userId] === 'number') ab.left[user.userId] = Math.max(0, ab.left[user.userId] - (Date.now() - entry.since));
  }

  const roomUser = room.users.get(user.userId);
  if (roomUser) roomUser.presence = 'active';

  socket.join(entry.roomId);

  // If another player of this room is still within their own grace window,
  // let this player back in to see the board, but don't resume the clock —
  // resuming here would run out the timer on the still-absent player's turn
  // even though their own grace window hasn't expired yet.
  // #396: only this room's seats can be in its grace — scanning the whole map made a reconnect storm O(N²).
  const otherStillAway = room.gameState.players.some((p) => {
    const other = p.userId !== user.userId && disconnectTimers.get(p.userId);
    return !!other && other.roomId === entry.roomId;
  });
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
    logger.debug(`[Disconnect] ${user.displayName} reconnected to room ${entry.roomId} but another player is still in grace — not resuming yet`);
    broadcastRoomUpdate(io, room);
    return true;
  }

  room.state = 'playing';

  const timer = timerMap.get(entry.roomId);
  if (timer) timer.start();
  const timerSync = timer ? timer.getSync() : null;

  // #398: one emit per side. The others get game:resumed carrying the clock (no separate timer:sync);
  // the reconnecting socket gets only game:init, which already carries timerSync, and whose client
  // handler sets status 'ongoing' + re-arms the watchdog. Rooms are in-memory only, so no pre-#398
  // tab can be mid-game on this server — no compat timer:sync kept.
  // No server-side chat:message here either — the client's game:resumed
  // handler already shows ChatUI.appendSystemMessage(t('room.reconnected'))
  // + a toast. See the matching comment in startDisconnectGrace (TODO #47).
  socket.to(entry.roomId).emit('game:resumed', { playerId: user.userId, timerSync });
  socket.emit('game:init', {
    ...room.gameState.serialize(),
    timer: timer ? timer.getTimers() : null,
    timerSync,
  });
  broadcastRoomUpdate(io, room);

  logger.debug(`[Disconnect] ${user.displayName} reconnected, game resumed in room ${entry.roomId}`);
  return true;
}

module.exports = {
  handleDisconnect, cancelDisconnectGrace, cancelEmptyRoomGrace, cancelSpectatorGrace,
  absenceWindowMs, voidsClockTimeout, inOutage, ABORT_MS, BOTH_GONE_MS, _resetOutage,
};
