'use strict';

/**
 * DmService — persisted member ↔ member direct messages (#198 slice 4).
 *
 * Text is stored in wire form (DmText.clean: angle brackets escaped, profanity
 * masked, ≤ 500); clients decode at render. Unread = rows addressed to me with
 * read_at NULL. An offline recipient gets one `dm` bell notification per sender
 * (a newer message replaces the older one). Newest DM_KEEP per conversation kept.
 *
 * Methods throw DmError(code, status); routes translate it to JSON.
 */

const database = require('../db/database');
const notifications = require('./NotificationService');
const dmText = require('./DmText');

const DM_KEEP = 500;
const PAGE = 30;

class DmError extends Error {
  constructor(code, status, message) {
    super(message || code);
    this.code = code;
    this.status = status;
  }
}

const db = () => database.db;
const convKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const isMember = (userId) => !!database.getUserById(userId);

let isOnline = () => false;
/** @param {{isOnline?: (userId: string) => boolean}} h */
function setHooks(h = {}) { isOnline = h.isOnline || (() => false); }

const person = (u) => ({
  username: u.username,
  displayName: u.display_name,
  avatarUrl: u.avatar_v ? `/api/profile/avatar/${u.id}.webp?v=${u.avatar_v}` : null,
});

function findUser(username) {
  const u = database.getUserByUsername(String(username || '').slice(0, 40));
  if (!u) throw new DmError('USER_NOT_FOUND', 404, 'Không tìm thấy người chơi.');
  return u;
}

/**
 * Store a message (text already cleaned). `notify` = push the recipient's bell entry.
 * @returns {{id:number, createdAt:string, createdAtMs:number}}
 */
function save(fromId, toId, text, { notify = false } = {}) {
  const key = convKey(fromId, toId);
  const createdAt = new Date().toISOString();
  const row = db().transaction(() => {
    const info = db().prepare(
      'INSERT INTO direct_messages (conv_key, sender_id, recipient_id, body, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(key, fromId, toId, text, createdAt);
    db().prepare(
      'DELETE FROM direct_messages WHERE conv_key = ? AND id <= (SELECT id FROM direct_messages WHERE conv_key = ? ORDER BY id DESC LIMIT 1 OFFSET ?)'
    ).run(key, key, DM_KEEP);
    return info.lastInsertRowid;
  })();
  if (notify) {
    const me = database.getUserById(fromId);
    notifications.push(toId, 'dm', fromId, { from: { username: me.username, displayName: me.display_name }, text: text.slice(0, 80) });
  }
  return { id: Number(row), createdAt, createdAtMs: Date.parse(createdAt) };
}

/** REST send: member → member, same pipeline as the socket path. */
function send(fromId, username, raw) {
  const to = findUser(username);
  if (to.id === fromId) throw new DmError('CANNOT_CHAT_SELF', 400, 'Không thể nhắn cho chính mình.');
  const text = dmText.clean(raw);
  if (!text) throw new DmError('EMPTY_MESSAGE', 400, 'Tin nhắn trống.');
  if (dmText.isRateLimited(fromId)) throw new DmError('PRIVATE_CHAT_RATE_LIMITED', 429, 'Bạn nhắn quá nhanh.');
  const online = isOnline(to.id);
  const saved = save(fromId, to.id, text, { notify: !online });
  if (online) {
    const me = database.getUserById(fromId);
    notifications.emitTo(to.id, 'private_message:receive', {
      messageId: String(saved.id), fromUserId: fromId, fromUsername: me.display_name,
      text, timestamp: saved.createdAtMs, conversationWith: fromId,
    });
  }
  return { id: saved.id, mine: true, text, at: saved.createdAt, read: false };
}

/** Conversations, newest first: other person, last message, unread count. */
function conversations(userId) {
  const rows = db().prepare(`
    SELECT m.* FROM direct_messages m
    JOIN (SELECT conv_key, MAX(id) AS id FROM direct_messages WHERE sender_id = ? OR recipient_id = ? GROUP BY conv_key) l ON l.id = m.id
    ORDER BY m.id DESC`).all(userId, userId);
  const unread = new Map(db().prepare(
    'SELECT sender_id, COUNT(*) AS n FROM direct_messages WHERE recipient_id = ? AND read_at IS NULL GROUP BY sender_id'
  ).all(userId).map((r) => [r.sender_id, r.n]));
  return rows.map((m) => {
    const otherId = m.sender_id === userId ? m.recipient_id : m.sender_id;
    return { with: person(database.getUserById(otherId)), last: { text: m.body, mine: m.sender_id === userId, at: m.created_at }, unread: unread.get(otherId) || 0 };
  });
}

/** A page of the thread, oldest → newest; `before` = message id to page back from. */
function history(userId, username, before) {
  const other = findUser(username);
  const key = convKey(userId, other.id);
  const b = Number.isInteger(before) ? before : Number.MAX_SAFE_INTEGER;
  const rows = db().prepare('SELECT * FROM direct_messages WHERE conv_key = ? AND id < ? ORDER BY id DESC LIMIT ?').all(key, b, PAGE + 1);
  const hasMore = rows.length > PAGE;
  const messages = rows.slice(0, PAGE).reverse().map((m) => ({
    id: m.id, mine: m.sender_id === userId, text: m.body, at: m.created_at, read: !!m.read_at,
  }));
  return { with: person(other), messages, hasMore };
}

/** Mark everything the other person sent me as read; clears their bell entry. */
function markRead(userId, username) {
  const other = findUser(username);
  db().prepare('UPDATE direct_messages SET read_at = ? WHERE recipient_id = ? AND sender_id = ? AND read_at IS NULL')
    .run(new Date().toISOString(), userId, other.id);
  notifications.drop(userId, 'dm', other.id);
  return unreadTotal(userId);
}

const unreadTotal = (userId) => db().prepare(
  'SELECT COUNT(*) AS n FROM direct_messages WHERE recipient_id = ? AND read_at IS NULL'
).get(userId).n;

module.exports = { DmError, DM_KEEP, PAGE, setHooks, isMember, save, send, conversations, history, markRead, unreadTotal };
