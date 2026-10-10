'use strict';

/**
 * MatchHandler.js — quick match (B197, R3).
 *
 * Events:
 *   match:join  {rule, time, rated} → match:status {waiting:true, since, inBucket} | match:error
 *   match:leave                     → match:status {waiting:false}
 *   (server) match:found {roomId}   + the usual room:joined, which the lobby already follows
 *
 * A pair becomes an ordinary room: A creates it, B joins, they sit in slots 1/2.
 * The game itself starts through the existing ready check (both press Start),
 * so no clock runs before both room pages have loaded.
 *
 * One ticker for the whole server, alive only while someone is queued.
 */

const logger = require('../../utils/logger');
const roomManager = require('../../managers/RoomManager');
const { seatPair } = require('../../managers/PairRoom');
const database = require('../../db/database');
const { MatchQueue, PRESETS } = require('../../managers/MatchQueue');
const {
  broadcastLobbyUpdate,
  broadcastRoomUpdate,
  getClientIp,
} = require('../state');

const TICK_MS = 1000;
const STATUS_EVERY_TICKS = 2;
const INITIAL_RATING = 1200; // RatingService's start value, for members with no games in a pool
const LOBBY_ROOM = 'lobby';

const queue = new MatchQueue();
let ticker = null;
let tickCount = 0;
let ioRef = null;

function ratingOf(userId, rule) {
  try {
    const r = database.getUserRanking(userId, rule);
    return r ? r.rating : INITIAL_RATING;
  } catch (err) {
    logger.warn('[Match] rating lookup failed', { uid: userId, err: err.message });
    return INITIAL_RATING;
  }
}

function socketOf(entry) {
  return ioRef && ioRef.sockets.sockets.get(entry.socketId);
}

function status(entry) {
  return { waiting: true, since: entry.since, inBucket: queue.countIn(entry), rule: entry.rule, time: entry.time, rated: entry.rated };
}

/** Turn a pair into a seated room. Returns the room, or null (both get match:error / requeue as needed). */
function makeRoom(a, b) {
  const sa = socketOf(a);
  const sb = socketOf(b);
  if (!sa || !sb) {
    // One side vanished between pairing and now: put the other back in line.
    for (const [e, s] of [[a, sa], [b, sb]]) {
      if (!s) continue;
      queue.join(e);
      s.emit('match:status', status(queue.get(e.userId)));
    }
    return null;
  }
  const settings = { ...PRESETS[a.time], winningRule: a.rule, ranked: a.rated, roomName: `${a.time} · ${a.displayName} vs ${b.displayName}` };
  const seated = seatPair(roomManager, a, b, settings, getClientIp(sa));
  if (seated.error) {
    for (const s of [sa, sb]) s.emit('match:error', { message: seated.error, code: seated.code });
    return null;
  }
  const room = seated.room;
  for (const s of [sa, sb]) {
    s.leave(LOBBY_ROOM);
    s.join(room.roomId);
  }
  const payload = roomManager.serializeRoom(room);
  for (const s of [sa, sb]) {
    s.emit('match:found', { roomId: room.roomId });
    s.emit('room:joined', payload);
  }
  broadcastRoomUpdate(ioRef, room);
  broadcastLobbyUpdate(ioRef);
  logger.info('[Match] paired', { roomId: room.roomId, time: a.time, rule: a.rule, rated: a.rated });
  return room;
}

function tick() {
  tickCount++;
  const pairs = queue.pair((e) => !!socketOf(e) && !roomManager.getRoomByUser(e.userId));
  for (const [a, b] of pairs) makeRoom(a, b);
  if (tickCount % STATUS_EVERY_TICKS === 0) {
    for (const e of queue.entries.values()) {
      const s = socketOf(e);
      if (s) s.emit('match:status', status(e));
    }
  }
  if (queue.size() === 0) stopTicker();
}

function startTicker() {
  if (!ticker) ticker = setInterval(tick, TICK_MS);
}
function stopTicker() {
  if (ticker) clearInterval(ticker);
  ticker = null;
}

/**
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function register(io, socket) {
  ioRef = io;
  const user = socket.user;

  socket.on('match:join', (payload = {}) => {
    if (roomManager.getRoomByUser(user.userId)) {
      socket.emit('match:error', { message: 'Bạn đang ở trong một phòng.', code: 'ALREADY_IN_ANOTHER_ROOM' });
      return;
    }
    const rule = String(payload.rule || '');
    const result = queue.join({
      userId: user.userId,
      displayName: user.displayName,
      isGuest: !!user.isGuest,
      socketId: socket.id,
      rule,
      time: String(payload.time || ''),
      rated: payload.rated === true,
      rating: payload.rated === true && !user.isGuest ? ratingOf(user.userId, rule) : INITIAL_RATING,
    });
    if (result.error) {
      socket.emit('match:error', { message: result.error, code: result.code });
      return;
    }
    socket.emit('match:status', status(result.entry));
    startTicker();
    tick(); // pair right away if someone is already waiting
  });

  socket.on('match:leave', () => {
    queue.leave(user.userId);
    socket.emit('match:status', { waiting: false });
  });

  socket.on('disconnect', () => {
    const e = queue.get(user.userId);
    if (e && e.socketId === socket.id) queue.leave(user.userId); // a newer tab's entry stays
  });
}

/** Test hooks. */
function _reset() {
  stopTicker();
  queue.entries.clear();
  tickCount = 0;
}

module.exports = { register, queueCounts: () => queue.counts(), _queue: queue, _tick: tick, _reset };
