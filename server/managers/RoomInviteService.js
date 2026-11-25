'use strict';

/**
 * RoomInviteService — the host invites an online member into the room they are in (F443).
 *
 * An invite is in-memory state (id, from, to, roomId, expiry) plus a persisted `room_invite`
 * notification for the target (the bell shows Chấp nhận / Từ chối). Accepting never joins or seats
 * anyone: it returns `{ roomId }` and the client opens `room.html?id=…`, where the normal `room:join`
 * makes the invitee a spectator. In a "Club members" room (F453) accepting also grants the
 * invitee a seat (room.invitedIds) when the inviter may sit themselves. Pending invites are lost on restart; a stale notification then
 * answers INVITE_GONE and the client drops the row.
 *
 * Methods throw RoomInviteError(code, status); the route translates it to JSON.
 */

const crypto = require('crypto');
const config = require('../config');
const database = require('../db/database');
const roomManager = require('./RoomManager');
const notifications = require('./NotificationService');
const privacyGate = require('./PrivacyGate');

const TTL_MS = 5 * 60 * 1000;
const MAX_OUTGOING = 5;
const RESEND_COOLDOWN_MS = 10 * 1000; // same sender → same target: one push per window (re-sends replace, so the cap alone never bites)

class RoomInviteError extends Error {
  constructor(code, status, message) {
    super(message || code);
    this.code = code;
    this.status = status;
  }
}
const fail = (code, status, message) => new RoomInviteError(code, status, message);

/** id → { id, from, to, roomId, createdAt, timer } */
const pending = new Map();
const NO_HOOKS = { onlineUsers: () => [], onRoomChanged: () => {} };
let hooks = NO_HOOKS;

/**
 * @param {{onlineUsers?: () => Array<{userId: string, isGuest: boolean}>, onRoomChanged?: (room: object) => void}} h
 *   onlineUsers: visible presence list (hidden-online excluded); onRoomChanged: broadcast after a seat grant (F453)
 */
function setHooks(h) {
  hooks = { ...NO_HOOKS, ...h };
}

const publicUser = (u) => ({
  userId: u.id,
  username: u.username,
  displayName: u.display_name,
  avatarUrl: u.avatar_v ? `/api/profile/avatar/${u.id}.webp?v=${u.avatar_v}` : null,
});

function remove(c) {
  clearTimeout(c.timer);
  pending.delete(c.id);
  notifications.drop(c.to, 'room_invite', c.from);
}

function mustGet(id) {
  const c = pending.get(String(id));
  if (!c) throw fail('INVITE_GONE', 404, 'Lời mời đã hết hạn hoặc bị huỷ.');
  return c;
}

const isFull = (room) => room.users.size >= config.MAX_USERS_PER_ROOM;

/** Host of `roomId` invites member `username`. */
function send(fromId, username, roomId) {
  if (typeof username !== 'string' || typeof roomId !== 'string' || !username || !roomId) {
    throw fail('BAD_REQUEST', 400, 'Thiếu thông tin lời mời.');
  }
  const target = database.getUserByUsername(username.slice(0, 40));
  if (!target) throw fail('USER_NOT_FOUND', 404, 'Không tìm thấy người chơi.');
  if (target.id === fromId) throw fail('CANNOT_INVITE_SELF', 400, 'Không thể tự mời mình.');
  const room = roomManager.getRoom(roomId);
  if (!room || roomManager.getRoomByUser(fromId) !== room) throw fail('NOT_IN_ROOM', 403, 'Bạn không ở trong phòng này.');
  if (room.host !== fromId) throw fail('NOT_HOST', 403, 'Chỉ chủ phòng mới mời được người chơi.');
  if (!privacyGate.allowed(fromId, target.id, 'challenge')) throw fail('INVITE_NOT_ALLOWED', 403, 'Người này không nhận lời mời từ bạn.');
  // No "target is in a room" check here: it would tell a host where a hidden-online user is. accept() guards it.
  if (isFull(room)) throw fail('ROOM_FULL', 409, 'Phòng đã đầy.');

  const prev = [...pending.values()].find((x) => x.from === fromId && x.to === target.id);
  if (prev && Date.now() - prev.createdAt < RESEND_COOLDOWN_MS) throw fail('INVITE_TOO_SOON', 429, 'Bạn vừa mời người này, hãy chờ vài giây.');
  if (prev) remove(prev); // re-send replaces
  if ([...pending.values()].filter((x) => x.from === fromId).length >= MAX_OUTGOING) {
    throw fail('TOO_MANY_INVITES', 429, 'Quá nhiều lời mời đang chờ.');
  }

  const me = database.getUserById(fromId);
  const c = { id: crypto.randomUUID(), from: fromId, to: target.id, roomId: room.roomId, roomName: room.roomName, createdAt: Date.now() };
  c.timer = setTimeout(() => remove(c), TTL_MS);
  if (c.timer.unref) c.timer.unref();
  pending.set(c.id, c);
  notifications.push(target.id, 'room_invite', fromId, {
    from: { username: me.username, displayName: me.display_name },
    inviteId: c.id, roomId: room.roomId, roomName: room.roomName,
  });
  return { id: c.id, roomId: c.roomId, to: publicUser(target), expiresAt: c.createdAt + TTL_MS };
}

/** Invitee accepts → `{ roomId }`. Nothing is joined or seated here. */
function accept(userId, id) {
  const c = mustGet(id);
  if (c.to !== userId) throw fail('NOT_YOUR_INVITE', 403, 'Không phải lời mời của bạn.');
  const room = roomManager.getRoom(c.roomId);
  if (!room) { remove(c); throw fail('INVITE_GONE', 404, 'Phòng không còn tồn tại.'); }
  if (!room.users.has(c.from)) { remove(c); throw fail('INVITE_GONE', 404, 'Người mời đã rời phòng.'); }
  const mine = roomManager.getRoomByUser(userId);
  if (mine && mine !== room) throw fail('ALREADY_IN_ANOTHER_ROOM', 409, 'Bạn đang ở trong một phòng khác.');
  if (!mine && isFull(room)) throw fail('ROOM_FULL', 409, 'Phòng đã đầy.');
  // F453: in a "Club members" room the invite also unlocks a seat (only if the inviter may sit).
  if (roomManager.grantInvite(room, c.from, userId)) hooks.onRoomChanged(room);
  remove(c);
  return { roomId: room.roomId };
}

/** Invitee declines or sender cancels. Idempotent for an invite that is already gone. */
function close(userId, id) {
  const c = pending.get(String(id));
  if (!c) return;
  if (c.to !== userId && c.from !== userId) throw fail('NOT_YOUR_INVITE', 403, 'Không phải lời mời của bạn.');
  remove(c);
  if (c.to === userId) { // declined (not a sender cancel): tell the inviter
    const me = database.getUserById(userId);
    if (me) {
      notifications.push(c.from, 'room_invite_declined', userId, {
        from: { username: me.username, displayName: me.display_name }, roomId: c.roomId, roomName: c.roomName,
      });
    }
  }
}

/**
 * Picker list (host only): visibly-online members `fromId` may invite — no guests, not self, nobody already in a
 * room, privacy gate applied. Uncapped (user decision).
 */
function onlineCandidates(fromId) {
  const mine = roomManager.getRoomByUser(fromId);
  if (!mine || mine.host !== fromId) throw fail('NOT_HOST', 403, 'Chỉ chủ phòng mới mời được người chơi.'); // also keeps "who is in a room" private
  const out = [];
  for (const o of hooks.onlineUsers() || []) {
    if (!o || o.isGuest || o.userId === fromId || roomManager.getRoomByUser(o.userId)) continue;
    const u = database.getUserById(o.userId);
    if (!u || !privacyGate.allowed(fromId, u.id, 'challenge')) continue;
    out.push(publicUser(u));
  }
  return out;
}

/** Server boot: the pending map is empty, so every persisted room_invite row is stale (a restart lost its invite). */
function purgeStale() {
  try { database.db.prepare("DELETE FROM notifications WHERE type = 'room_invite'").run(); } catch (_) { /* best-effort */ }
}

function _reset() {
  for (const c of pending.values()) clearTimeout(c.timer);
  pending.clear();
}

module.exports = { RoomInviteError, TTL_MS, MAX_OUTGOING, RESEND_COOLDOWN_MS, setHooks, send, accept, close, onlineCandidates, purgeStale, _reset };
