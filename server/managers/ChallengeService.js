'use strict';

/**
 * ChallengeService — friend challenges (#198 slice 3).
 *
 * A challenge is in-memory state (id, from, to, rule, time, rated, expiry) plus a
 * persisted `challenge` notification for the target. Accepting turns it into a
 * seated room via PairRoom (same path as quick match) — A = challenger in slot 1,
 * B = accepter in slot 2. Neither side needs a live socket: room pages rejoin by
 * user id on connect; `hooks.onSeated` lets SocketHandler redirect whoever IS
 * connected. A seated user who never shows up is released after SEAT_GRACE_MS.
 *
 * Methods throw ChallengeError(code, status); routes translate it to JSON.
 */

const crypto = require('crypto');
const database = require('../db/database');
const roomManager = require('./RoomManager');
const notifications = require('./NotificationService');
const { seatPair } = require('./PairRoom');
const { RULES, PRESETS } = require('./MatchQueue');
const privacyGate = require('./PrivacyGate');

const TTL_MS = 2 * 60 * 1000;
const MAX_OUTGOING = 5;
const SEAT_GRACE_MS = 90 * 1000;

class ChallengeError extends Error {
  constructor(code, status, message) {
    super(message || code);
    this.code = code;
    this.status = status;
  }
}

/** id → { id, from, to, rule, time, rated, createdAt, timer } */
const pending = new Map();
let hooks = { onSeated: () => {}, onRoomChanged: () => {}, isOnline: () => false };

/** @param {{onSeated?: (room, userIds) => void, onRoomChanged?: (room) => void, isOnline?: (userId) => boolean}} h */
function setHooks(h) {
  hooks = { onSeated: () => {}, onRoomChanged: () => {}, isOnline: () => false, ...h };
}

const publicUser = (u) => ({
  userId: u.id,
  username: u.username,
  displayName: u.display_name,
  avatarUrl: u.avatar_v ? `/api/profile/avatar/${u.id}.webp?v=${u.avatar_v}` : null,
});

function remove(c, { dropNotification = true } = {}) {
  clearTimeout(c.timer);
  pending.delete(c.id);
  if (dropNotification) notifications.drop(c.to, 'challenge', c.from);
}

function send(fromId, username, { rule, time, rated } = {}) {
  const target = database.getUserByUsername(String(username || '').slice(0, 40));
  if (!target) throw new ChallengeError('USER_NOT_FOUND', 404, 'Không tìm thấy người chơi.');
  if (target.id === fromId) throw new ChallengeError('CANNOT_CHALLENGE_SELF', 400, 'Không thể tự thách đấu.');
  if (!privacyGate.allowed(fromId, target.id, 'challenge')) throw new ChallengeError('CHALLENGE_NOT_ALLOWED', 403, 'Người này không nhận thách đấu từ bạn.');
  if (!RULES.includes(rule)) throw new ChallengeError('BAD_RULE', 400, 'Luật không hợp lệ.');
  if (!PRESETS[time]) throw new ChallengeError('BAD_TIME', 400, 'Thời gian không hợp lệ.');
  for (const c of [...pending.values()]) if (c.from === fromId && c.to === target.id) remove(c); // re-send replaces
  const outgoing = [...pending.values()].filter((c) => c.from === fromId).length;
  if (outgoing >= MAX_OUTGOING) throw new ChallengeError('TOO_MANY_CHALLENGES', 429, 'Quá nhiều thách đấu đang chờ.');

  const me = database.getUserById(fromId);
  const c = {
    id: crypto.randomUUID(), from: fromId, to: target.id, rule, time, rated: rated === true, createdAt: Date.now(),
  };
  c.timer = setTimeout(() => remove(c), TTL_MS);
  if (c.timer.unref) c.timer.unref();
  pending.set(c.id, c);
  notifications.push(target.id, 'challenge', fromId, {
    from: { username: me.username, displayName: me.display_name },
    challengeId: c.id, rule, time, rated: c.rated,
  });
  return view(c);
}

function view(c) {
  return { id: c.id, rule: c.rule, time: c.time, rated: c.rated, expiresAt: c.createdAt + TTL_MS };
}

function list(userId) {
  const out = { incoming: [], outgoing: [] };
  for (const c of pending.values()) {
    if (c.to === userId) out.incoming.push({ ...view(c), from: publicUser(database.getUserById(c.from)) });
    else if (c.from === userId) out.outgoing.push({ ...view(c), to: publicUser(database.getUserById(c.to)) });
  }
  return out;
}

function mustGet(id) {
  const c = pending.get(String(id));
  if (!c) throw new ChallengeError('CHALLENGE_GONE', 404, 'Thách đấu đã hết hạn hoặc bị huỷ.');
  return c;
}

/** Recipient accepts: seat both, return the room. */
function accept(userId, id, ip) {
  const c = mustGet(id);
  if (c.to !== userId) throw new ChallengeError('NOT_YOUR_CHALLENGE', 403, 'Không phải thách đấu của bạn.');
  if (roomManager.getRoomByUser(c.from) || roomManager.getRoomByUser(c.to)) {
    throw new ChallengeError('ALREADY_IN_ANOTHER_ROOM', 409, 'Một trong hai người đang ở trong phòng khác.');
  }
  const a = database.getUserById(c.from);
  const b = database.getUserById(c.to);
  const settings = { ...PRESETS[c.time], winningRule: c.rule, ranked: c.rated, roomName: `${c.time} · ${a.display_name} vs ${b.display_name}` };
  const seated = seatPair(
    roomManager,
    { userId: a.id, displayName: a.display_name },
    { userId: b.id, displayName: b.display_name },
    settings,
    ip
  );
  if (seated.error) throw new ChallengeError(seated.code, 409, seated.error);
  remove(c);
  const { room } = seated;
  notifications.push(c.from, 'challenge_accepted', c.to, { from: { username: b.username, displayName: b.display_name }, roomId: room.roomId });
  try { hooks.onSeated(room, [a.id, b.id]); } catch (_) { /* redirect is best-effort */ }
  scheduleSeatCheck(room.roomId, [a.id, b.id]);
  return { roomId: room.roomId };
}

/** Free anyone seated by challenge who never connected (no socket, game not started). */
function scheduleSeatCheck(roomId, userIds) {
  const t = setTimeout(() => {
    const room = roomManager.getRoom(roomId);
    if (!room || room.state !== 'idle') return;
    for (const uid of userIds) {
      if (!hooks.isOnline(uid) && roomManager.getRoomByUser(uid) === room) roomManager.leaveRoom(uid);
    }
    if (roomManager.getRoom(roomId)) { try { hooks.onRoomChanged(room); } catch (_) { /* best-effort */ } }
  }, SEAT_GRACE_MS);
  if (t.unref) t.unref();
}

/** Recipient declines or sender cancels. Idempotent for a challenge that is already gone. */
function close(userId, id) {
  const c = pending.get(String(id));
  if (!c) return;
  if (c.to !== userId && c.from !== userId) throw new ChallengeError('NOT_YOUR_CHALLENGE', 403, 'Không phải thách đấu của bạn.');
  remove(c);
}

function _reset() {
  for (const c of pending.values()) clearTimeout(c.timer);
  pending.clear();
}

module.exports = {
  ChallengeError, TTL_MS, MAX_OUTGOING, SEAT_GRACE_MS, setHooks, send, list, accept, close, _reset,
};
