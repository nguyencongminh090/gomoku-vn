'use strict';

/**
 * home-feed.js — live push for the "Chơi" dashboard (B225).
 *
 * Clients on the home screen join the socket.io room `home` (`home:subscribe`)
 * and get:
 *   home:stats {online, playing, searching} — absolute counts, never +1/-1, so
 *               a missed event can't drift; the next one (or the 60 s poll) heals it.
 *   home:live   [..] — the same top-N list /api/home returns, re-sent only when
 *               the SET of playing rooms changes (game start/end), not per move.
 *
 * Call sites don't describe changes: they call scheduleHomeUpdate(io) wherever
 * the lobby / online list / match queue already says "something changed", and
 * the flush recomputes from real state and emits only what differs from what
 * subscribers were last told — the same shape as broadcastLobbyUpdate().
 *
 * In-process only: a multi-instance deploy would need the socket.io Redis adapter.
 */

const roomManager = require('../managers/RoomManager');
const { liveOf, playingCount } = require('../routes/home');

const HOME_ROOM = 'home';
const HOME_DEBOUNCE_MS = 1_500; // same window as broadcastOnlineUsers

/** Per-io pending flush timer. */
const _timers = new WeakMap();
/** Per-io { stats, liveKey } last emitted to the room — null when nobody was listening. */
const _last = new WeakMap();
/** Per-io: someone subscribed while a flush was pending → that flush must emit even if unchanged. */
const _force = new WeakSet();

// Lazy: state.js and MatchHandler both require this module's callers.
function stats() {
  const queue = require('./handlers/MatchHandler').queueCounts();
  return {
    online: require('./state').getOnlineUsersList().length,
    playing: playingCount(roomManager),
    searching: Object.values(queue).reduce((a, b) => a + b, 0),
  };
}

function liveKey() {
  const ids = [];
  for (const room of roomManager.rooms.values()) if (room.state === 'playing' && room.gameState) ids.push(room.roomId);
  return ids.sort().join(',');
}

const statsKey = (s) => `${s.online}|${s.playing}|${s.searching}`;

function subscriberCount(io) {
  const rooms = io.sockets && io.sockets.adapter && io.sockets.adapter.rooms; // test fakes of io often lack an adapter
  const room = rooms && rooms.get(HOME_ROOM);
  return room ? room.size : 0;
}

function _flush(io) {
  _timers.delete(io);
  const forced = _force.has(io);
  _force.delete(io);
  if (subscriberCount(io) === 0) { _last.delete(io); return; }

  const prev = _last.get(io);
  const s = stats();
  const key = liveKey();
  if (forced || !prev || statsKey(prev.stats) !== statsKey(s)) io.to(HOME_ROOM).emit('home:stats', s);
  if (forced || !prev || prev.liveKey !== key) io.to(HOME_ROOM).emit('home:live', liveOf(roomManager));
  _last.set(io, { stats: s, liveKey: key });
}

/** "Something the dashboard shows may have changed" — coalesced to ≤ 1 flush per window. */
function scheduleHomeUpdate(io) {
  if (!io || _timers.has(io)) return;
  const timer = setTimeout(() => _flush(io), HOME_DEBOUNCE_MS);
  if (timer.unref) timer.unref();
  _timers.set(io, timer);
}

/**
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function register(io, socket) {
  socket.on('home:subscribe', () => {
    socket.join(HOME_ROOM);
    const s = stats();
    socket.emit('home:stats', s);
    socket.emit('home:live', liveOf(roomManager));
    // A pending flush may compare against a baseline older than what this socket just got;
    // with none pending, what it got IS the current state, so it becomes the baseline.
    if (_timers.has(io)) _force.add(io);
    else _last.set(io, { stats: s, liveKey: liveKey() });
  });
  socket.on('home:unsubscribe', () => socket.leave(HOME_ROOM));
  // disconnect: socket.io drops the socket from every room itself.
}

/** Test hook. */
function _reset(io) {
  const t = _timers.get(io);
  if (t) clearTimeout(t);
  _timers.delete(io);
  _last.delete(io);
  _force.delete(io);
}

module.exports = { register, scheduleHomeUpdate, HOME_ROOM, HOME_DEBOUNCE_MS, _reset };
