'use strict';

/**
 * FriendService — mutual friendships (#198 slice 1).
 *
 * Request → the other side accepts. A request made while the other side already
 * has one pending towards you accepts it (no duplicate rows). Cancel, decline
 * and unfriend are all "delete the pair". Members only (callers pass user ids).
 *
 * Methods throw FriendError(code, status); routes translate it to JSON.
 */

const crypto = require('crypto');
const database = require('../db/database');
const notifications = require('./NotificationService');
const privacyGate = require('./PrivacyGate');
const userSearch = require('../db/user-search');

const MAX_FRIENDS = 500;
const MAX_OUTGOING = 50;

class FriendError extends Error {
  constructor(code, status, message) {
    super(message || code);
    this.code = code;
    this.status = status;
  }
}

const db = () => database.db;
const pair = (x, y) => (x < y ? [x, y] : [y, x]);

function findUser(username) {
  const u = database.getUserByUsername(String(username).slice(0, 40));
  if (!u) throw new FriendError('USER_NOT_FOUND', 404, 'Không tìm thấy người chơi.');
  return u;
}

function getRow(a, b) {
  const [x, y] = pair(a, b);
  return db().prepare('SELECT * FROM friendships WHERE user_a = ? AND user_b = ?').get(x, y);
}

const countFriends = (id) => db().prepare(
  "SELECT COUNT(*) AS n FROM friendships WHERE status = 'accepted' AND (user_a = ? OR user_b = ?)"
).get(id, id).n;

/** 'self' | 'none' | 'friends' | 'outgoing' (I asked) | 'incoming' (they asked) */
function statusBetween(me, other) {
  if (!me || !other) return 'none';
  if (me === other) return 'self';
  const r = getRow(me, other);
  if (!r) return 'none';
  if (r.status === 'accepted') return 'friends';
  return r.requested_by === me ? 'outgoing' : 'incoming';
}

function accept(row) {
  db().prepare("UPDATE friendships SET status = 'accepted' WHERE user_a = ? AND user_b = ?").run(row.user_a, row.user_b);
}

const actor = (id) => {
  const u = database.getUserById(id);
  return { username: u.username, displayName: u.display_name };
};

/** `accepter` said yes: tell the other side, and clear the request notification the accepter held. */
function notifyAccepted(accepter, otherId) {
  notifications.drop(accepter, 'friend_request', otherId);
  notifications.drop(otherId, 'friend_request', accepter);
  notifications.push(otherId, 'friend_accepted', accepter, { from: actor(accepter) });
}

function request(me, username) {
  const other = findUser(username);
  if (other.id === me) throw new FriendError('CANNOT_FRIEND_SELF', 400, 'Không thể kết bạn với chính mình.');
  const result = db().transaction(() => {
    const row = getRow(me, other.id);
    if (row && row.status === 'accepted') throw new FriendError('ALREADY_FRIENDS', 409, 'Đã là bạn bè.');
    if (row && row.requested_by === me) throw new FriendError('REQUEST_PENDING', 409, 'Đã gửi lời mời.');
    if (countFriends(me) >= MAX_FRIENDS || countFriends(other.id) >= MAX_FRIENDS) {
      throw new FriendError('FRIEND_LIMIT', 409, 'Danh sách bạn bè đã đầy.');
    }
    if (row) { accept(row); return 'friends'; } // crossed requests (notified after the transaction)
    // Only a NEW request is gated; answering a crossed one (above) is always fine.
    // 'friends' can never hold for a stranger, so for this action it behaves like 'nobody'.
    if (!privacyGate.allowed(me, other.id, 'friend')) throw new FriendError('FRIEND_REQUEST_NOT_ALLOWED', 403, 'Người này không nhận lời mời kết bạn.');
    const out = db().prepare("SELECT COUNT(*) AS n FROM friendships WHERE status = 'pending' AND requested_by = ?").get(me).n;
    if (out >= MAX_OUTGOING) throw new FriendError('TOO_MANY_REQUESTS', 429, 'Quá nhiều lời mời đang chờ.');
    const [x, y] = pair(me, other.id);
    db().prepare('INSERT INTO friendships (user_a, user_b, requested_by, status, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(x, y, me, 'pending', new Date().toISOString());
    return 'outgoing';
  })();
  if (result === 'outgoing') notifications.push(other.id, 'friend_request', me, { from: actor(me) });
  else notifyAccepted(me, other.id); // crossed requests
  return result;
}

function acceptRequest(me, username) {
  const other = findUser(username);
  const result = db().transaction(() => {
    const row = getRow(me, other.id);
    if (!row || row.status !== 'pending' || row.requested_by === me) {
      throw new FriendError('NO_REQUEST', 404, 'Không có lời mời để chấp nhận.');
    }
    if (countFriends(me) >= MAX_FRIENDS || countFriends(other.id) >= MAX_FRIENDS) {
      throw new FriendError('FRIEND_LIMIT', 409, 'Danh sách bạn bè đã đầy.');
    }
    accept(row);
    return 'friends';
  })();
  notifyAccepted(me, other.id);
  return result;
}

/** Cancel my request, decline theirs, or unfriend. Idempotent. */
function remove(me, username) {
  const other = findUser(username);
  const [x, y] = pair(me, other.id);
  db().prepare('DELETE FROM friendships WHERE user_a = ? AND user_b = ?').run(x, y);
  // A cancelled / declined request must not linger in anyone's bell.
  notifications.drop(other.id, 'friend_request', me);
  notifications.drop(me, 'friend_request', other.id);
  return 'none';
}

/** Accepted friends' ids (no self) — used by the rankings "Bạn bè" scope. */
function friendIds(me) {
  return db().prepare(`
    SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END AS id
    FROM friendships WHERE status = 'accepted' AND (user_a = ? OR user_b = ?)`)
    .all(me, me, me).map((r) => r.id);
}

const person = (r) => ({
  username: r.username,
  displayName: r.display_name,
  avatarUrl: r.avatar_v ? `/api/profile/avatar/${r.id}.webp?v=${r.avatar_v}` : null,
});

let isOnline = () => false;
/** @param {{isOnline?: (userId: string) => boolean}} h  visible presence, for friends only (#222 picker) */
function setHooks(h = {}) { isOnline = h.isOnline || (() => false); }

function list(me) {
  const rows = db().prepare(`
    SELECT u.id, u.username, u.display_name, u.avatar_v, f.status, f.requested_by
    FROM friendships f
    JOIN users u ON u.id = CASE WHEN f.user_a = ? THEN f.user_b ELSE f.user_a END
    WHERE f.user_a = ? OR f.user_b = ?
    ORDER BY u.display_name COLLATE NOCASE`).all(me, me, me);
  const out = { friends: [], incoming: [], outgoing: [] };
  for (const r of rows) {
    if (r.status === 'accepted') out.friends.push({ ...person(r), online: !!isOnline(r.id) });
    else (r.requested_by === me ? out.outgoing : out.incoming).push(person(r));
  }
  return out;
}

const SEARCH_MIN = 2;
const SEARCH_LIMIT = 8;

const CODE_RE = /^(.{1,40})#(\d{4})$/;

/** My shareable code "username#1234". The 4-digit tag is random, stored once, never derived from the name. */
function myCode(me) {
  const u = database.getUserById(me);
  if (!u) throw new FriendError('USER_NOT_FOUND', 404, 'Không tìm thấy người chơi.');
  let tag = u.friend_tag;
  if (!tag) {
    tag = String(crypto.randomInt(0, 10000)).padStart(4, '0');
    db().prepare('UPDATE users SET friend_tag = ? WHERE id = ? AND friend_tag IS NULL').run(tag, me);
    tag = database.getUserById(me).friend_tag;
  }
  return `${u.username}#${tag}`;
}

/** Exact "name#1234" lookup (case-insensitive name); same shape as a search hit, or []. */
function searchByCode(me, name, tag) {
  const r = db().prepare('SELECT id, username, display_name, avatar_v FROM users WHERE id != ? AND LOWER(username) = LOWER(?) AND friend_tag = ?')
    .get(me, name, tag);
  return r ? [hit(me, r)] : [];
}

function hit(me, r) {
  const status = statusBetween(me, r.id);
  return { ...person(r), status, canRequest: status !== 'none' || privacyGate.allowed(me, r.id, 'friend') };
}

/**
 * Find players to add by username or display name — accent/case-insensitive, any word order,
 * tolerant of a typo (utils/text-search.js), best match first. Each hit carries the relation to `me` and whether a NEW request
 * would pass the recipient's privacy setting, so the UI can disable the button up front.
 */
function search(me, query) {
  const q = String(query || '').trim().slice(0, 40);
  if (q.length < SEARCH_MIN) return [];
  const code = CODE_RE.exec(q);
  if (code) return searchByCode(me, code[1].trim(), code[2]);
  const ids = userSearch.matchUserIds(q, { limit: SEARCH_LIMIT, exclude: me });
  if (!ids.length) return [];
  const byId = new Map(db().prepare(`SELECT id, username, display_name, avatar_v FROM users WHERE id IN (SELECT value FROM json_each(?))`)
    .all(JSON.stringify(ids)).map((r) => [r.id, r]));
  const rows = ids.map((id) => byId.get(id)).filter(Boolean); // keep relevance order
  return rows.map((r) => hit(me, r));
}

module.exports = {
  FriendError, MAX_FRIENDS, MAX_OUTGOING,
  statusBetween, request, acceptRequest, remove, friendIds, list, search, myCode, setHooks,
};
