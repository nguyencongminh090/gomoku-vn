'use strict';

/**
 * NotificationService — persisted notifications + live push (#198 slice 2).
 *
 * push() stores a row, then calls the injected emitter (SocketHandler wires it
 * to the user's live socket as `notify:new`); offline users see it on their next
 * fetch. A repeat of the same (type, actor) replaces the older row, so
 * request → cancel → request never stacks. Newest MAX_PER_USER kept.
 */

const database = require('../db/database');

const MAX_PER_USER = 100;
const TYPES = ['friend_request', 'friend_accepted', 'challenge', 'dm'];

let emitter = () => {};
const db = () => database.db;

/** @param {(userId: string, event: string, payload: object) => void} fn */
function setEmitter(fn) {
  emitter = typeof fn === 'function' ? fn : () => {};
}

function shape(r) {
  let payload = {};
  try { payload = JSON.parse(r.payload); } catch (_) { /* corrupt row: show it bare */ }
  return { id: r.id, type: r.type, payload, read: !!r.read_at, createdAt: r.created_at };
}

function unreadCount(userId) {
  return db().prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(userId).n;
}

/** Remove a pending notification of (type, actor) — e.g. the request was cancelled. */
function drop(userId, type, actorId) {
  db().prepare('DELETE FROM notifications WHERE user_id = ? AND type = ? AND actor_id = ?').run(userId, type, actorId);
}

function push(userId, type, actorId, payload = {}) {
  if (!TYPES.includes(type)) throw new Error(`unknown notification type: ${type}`);
  const row = db().transaction(() => {
    if (actorId) drop(userId, type, actorId);
    const info = db().prepare(
      'INSERT INTO notifications (user_id, type, actor_id, payload, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(userId, type, actorId || null, JSON.stringify(payload), new Date().toISOString());
    db().prepare(
      'DELETE FROM notifications WHERE user_id = ? AND id <= (SELECT id FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)'
    ).run(userId, userId, MAX_PER_USER);
    return db().prepare('SELECT * FROM notifications WHERE id = ?').get(info.lastInsertRowid);
  })();
  const n = shape(row);
  try { emitter(userId, 'notify:new', { ...n, unread: unreadCount(userId) }); } catch (_) { /* push is best-effort */ }
  return n;
}

function list(userId, limit = 30) {
  const rows = db().prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit);
  return { unread: unreadCount(userId), items: rows.map(shape) };
}

/** Mark one (id) or all read. */
function markRead(userId, id) {
  const now = new Date().toISOString();
  if (id == null) {
    db().prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL').run(now, userId);
  } else {
    db().prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND id = ? AND read_at IS NULL').run(now, userId, id);
  }
  return unreadCount(userId);
}

module.exports = { MAX_PER_USER, TYPES, setEmitter, push, drop, list, markRead, unreadCount };
