'use strict';

/**
 * ForumService — categories, threads and replies (TODO.md #203 7c, features/learn).
 *
 * Plain text only: bodies are stored as typed (control characters stripped, profanity masked, newlines
 * kept) and the client renders them with textContent, so nothing is HTML-escaped here (escaping too
 * would show "&lt;" to readers). Guests read, members write, staff (`users.role`) delete and
 * handle reports. Deleting is soft; readers get a "deleted" placeholder and never the body.
 *
 * Methods throw ForumError(code, status); routes translate it to JSON.
 */

const crypto = require('crypto');
const database = require('../db/database');
const roles = require('../utils/roles');
const profanityFilter = require('../../client/js/profanity-filter');

const db = () => database.db;

const CATEGORIES = ['general', 'tactics', 'analysis', 'help'];
const TITLE_MAX = 100;
const BODY_MAX = 4000;
const REASON_MAX = 200;
const THREADS_PER_PAGE = 20;
const POSTS_PER_PAGE = 30;
const THREAD_COOLDOWN_MS = 60 * 1000;   // one new thread per member per minute
const POST_COOLDOWN_MS = 10 * 1000;     // one reply per member per 10 s

class ForumError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'ForumError';
    this.code = code;
    this.status = status;
  }
}
const bad = (code, message) => new ForumError(code, 400, message);
const notFound = () => new ForumError('FORUM_NOT_FOUND', 404, 'Không tìm thấy bài viết.');

/** May moderate the forum (moderator or admin, R8). */
const isAdmin = (userId) => roles.can(userId, 'forum.moderate');

/** Control chars out (newline/tab kept), CRLF → LF, 3+ blank lines → 2, trimmed, profanity masked. */
function cleanText(raw) {
  if (typeof raw !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const text = raw.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\n{3,}/g, '\n\n').trim();
  return text ? profanityFilter.filterMessage(text) : '';
}

const lastAt = new Map(); // `${kind}:${userId}` → ms
function throttle(kind, userId, ms) {
  const key = kind + ':' + userId;
  const now = Date.now();
  if (now - (lastAt.get(key) || 0) < ms) throw new ForumError('FORUM_RATE_LIMITED', 429, 'Bạn đăng quá nhanh, hãy đợi một chút.');
  lastAt.set(key, now);
}

const AUTHOR = 'u.username AS author_username, u.display_name AS author_name';

function authorOf(row) {
  return { username: row.author_username, displayName: row.author_name };
}

function threadShape(row, { body = false } = {}) {
  const out = {
    id: row.id, category: row.category, title: row.deleted ? '' : row.title, author: authorOf(row),
    createdAt: row.created_at, lastPostAt: row.last_post_at, replyCount: row.reply_count, deleted: !!row.deleted,
  };
  if (body) out.body = row.deleted ? '' : row.body;
  return out;
}

function listThreads(viewerId, { category, page } = {}) {
  if (category !== undefined && category !== '' && !CATEGORIES.includes(category)) throw bad('FORUM_CATEGORY_INVALID', 'Danh mục không hợp lệ.');
  const where = ['t.deleted = 0'];
  const params = [];
  if (category) { where.push('t.category = ?'); params.push(category); }
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const total = db().prepare(`SELECT COUNT(*) AS n FROM forum_threads t WHERE ${where.join(' AND ')}`).get(...params).n;
  const rows = db().prepare(`SELECT t.*, ${AUTHOR} FROM forum_threads t JOIN users u ON u.id = t.author_id
    WHERE ${where.join(' AND ')} ORDER BY t.last_post_at DESC, t.id LIMIT ? OFFSET ?`).all(...params, THREADS_PER_PAGE, (pg - 1) * THREADS_PER_PAGE);
  return {
    threads: rows.map((r) => threadShape(r)),
    pagination: { page: pg, limit: THREADS_PER_PAGE, total, totalPages: Math.ceil(total / THREADS_PER_PAGE) },
    canModerate: isAdmin(viewerId),
  };
}

/** One thread + a page of replies. Deleted threads 404 for everyone but staff; deleted replies keep their slot, minus body. */
function getThread(viewerId, id, { page } = {}) {
  const row = db().prepare(`SELECT t.*, ${AUTHOR} FROM forum_threads t JOIN users u ON u.id = t.author_id WHERE t.id = ?`).get(String(id).slice(0, 64));
  const staff = isAdmin(viewerId);
  if (!row || (row.deleted && !staff)) throw notFound();
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const total = db().prepare('SELECT COUNT(*) AS n FROM forum_posts WHERE thread_id = ?').get(row.id).n;
  const posts = db().prepare(`SELECT p.*, ${AUTHOR} FROM forum_posts p JOIN users u ON u.id = p.author_id
    WHERE p.thread_id = ? ORDER BY p.created_at, p.id LIMIT ? OFFSET ?`).all(row.id, POSTS_PER_PAGE, (pg - 1) * POSTS_PER_PAGE);
  return {
    thread: threadShape(row, { body: true }),
    posts: posts.map((p) => ({ id: p.id, author: authorOf(p), body: p.deleted ? '' : p.body, createdAt: p.created_at, deleted: !!p.deleted })),
    pagination: { page: pg, limit: POSTS_PER_PAGE, total, totalPages: Math.ceil(total / POSTS_PER_PAGE) },
    canModerate: staff,
  };
}

function createThread(userId, { category, title, body } = {}) {
  if (!CATEGORIES.includes(category)) throw bad('FORUM_CATEGORY_INVALID', 'Danh mục không hợp lệ.');
  const t = cleanText(title).replace(/\s*\n\s*/g, ' ');
  if (!t || t.length > TITLE_MAX) throw bad('FORUM_TITLE_INVALID', `Tiêu đề dài 1–${TITLE_MAX} ký tự.`);
  const b = cleanText(body);
  if (!b || b.length > BODY_MAX) throw bad('FORUM_BODY_INVALID', `Nội dung dài 1–${BODY_MAX} ký tự.`);
  throttle('thread', userId, THREAD_COOLDOWN_MS);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db().prepare('INSERT INTO forum_threads (id, category, author_id, title, body, created_at, last_post_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, category, userId, t, b, now, now);
  return { id };
}

function reply(userId, threadId, { body } = {}) {
  const b = cleanText(body);
  if (!b || b.length > BODY_MAX) throw bad('FORUM_BODY_INVALID', `Nội dung dài 1–${BODY_MAX} ký tự.`);
  return db().transaction(() => {
    const t = db().prepare('SELECT id, deleted FROM forum_threads WHERE id = ?').get(String(threadId).slice(0, 64));
    if (!t || t.deleted) throw notFound();
    throttle('post', userId, POST_COOLDOWN_MS);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db().prepare('INSERT INTO forum_posts (id, thread_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)').run(id, t.id, userId, b, now);
    db().prepare('UPDATE forum_threads SET reply_count = reply_count + 1, last_post_at = ? WHERE id = ?').run(now, t.id);
    return { id };
  })();
}

function requireStaff(userId) {
  if (!isAdmin(userId)) throw new ForumError('FORUM_FORBIDDEN', 403, 'Bạn không có quyền.');
}

/** Staff soft-delete of a whole thread (type 'thread') or one reply (type 'post'). Idempotent. */
function remove(staffId, type, id) {
  requireStaff(staffId);
  return db().transaction(() => {
    if (type === 'thread') {
      if (!db().prepare('UPDATE forum_threads SET deleted = 1 WHERE id = ?').run(String(id).slice(0, 64)).changes) throw notFound();
    } else if (type === 'post') {
      const p = db().prepare('SELECT id, thread_id, deleted FROM forum_posts WHERE id = ?').get(String(id).slice(0, 64));
      if (!p) throw notFound();
      if (!p.deleted) {
        db().prepare('UPDATE forum_posts SET deleted = 1 WHERE id = ?').run(p.id);
        db().prepare('UPDATE forum_threads SET reply_count = MAX(0, reply_count - 1) WHERE id = ?').run(p.thread_id);
      }
    } else {
      throw bad('FORUM_TARGET_INVALID', 'Đối tượng không hợp lệ.');
    }
    return { ok: true };
  })();
}

/** A member flags a thread/reply. One open report per reporter per target (a repeat is a no-op, not an error). */
function report(userId, { type, id, reason } = {}) {
  if (type !== 'thread' && type !== 'post') throw bad('FORUM_TARGET_INVALID', 'Đối tượng không hợp lệ.');
  const r = cleanText(reason).replace(/\s*\n\s*/g, ' ');
  if (!r || r.length > REASON_MAX) throw bad('FORUM_REASON_INVALID', `Lý do dài 1–${REASON_MAX} ký tự.`);
  const target = String(id).slice(0, 64);
  const threadId = type === 'thread'
    ? db().prepare('SELECT id FROM forum_threads WHERE id = ? AND deleted = 0').get(target)?.id
    : db().prepare('SELECT thread_id FROM forum_posts WHERE id = ? AND deleted = 0').get(target)?.thread_id;
  if (!threadId) throw notFound();
  db().prepare('INSERT OR IGNORE INTO forum_reports (id, target_type, target_id, thread_id, reporter_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(crypto.randomUUID(), type, target, threadId, userId, r, new Date().toISOString());
  return { ok: true };
}

/** Open reports, oldest first, each with a preview of the reported text and the reporter. Staff only. */
function openReports(staffId, { page } = {}) {
  requireStaff(staffId);
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const total = db().prepare('SELECT COUNT(*) AS n FROM forum_reports WHERE resolved_at IS NULL').get().n;
  const rows = db().prepare(`SELECT r.*, u.username AS reporter_username, u.display_name AS reporter_name FROM forum_reports r
    JOIN users u ON u.id = r.reporter_id WHERE r.resolved_at IS NULL ORDER BY r.created_at, r.id LIMIT ? OFFSET ?`)
    .all(THREADS_PER_PAGE, (pg - 1) * THREADS_PER_PAGE);
  const reports = rows.map((r) => {
    const src = r.target_type === 'thread'
      ? db().prepare('SELECT title, body, deleted FROM forum_threads WHERE id = ?').get(r.target_id)
      : db().prepare('SELECT body, deleted FROM forum_posts WHERE id = ?').get(r.target_id);
    return {
      id: r.id, type: r.target_type, targetId: r.target_id, threadId: r.thread_id, reason: r.reason, createdAt: r.created_at,
      reporter: { username: r.reporter_username, displayName: r.reporter_name },
      excerpt: src ? ((src.title ? src.title + ' — ' : '') + src.body).slice(0, 300) : '',
      targetDeleted: !src || !!src.deleted,
    };
  });
  return { reports, pagination: { page: pg, limit: THREADS_PER_PAGE, total, totalPages: Math.ceil(total / THREADS_PER_PAGE) } };
}

/** Close a report; `remove: true` also soft-deletes what it points at. */
function resolveReport(staffId, reportId, { remove: del } = {}) {
  requireStaff(staffId);
  return db().transaction(() => {
    const r = db().prepare('SELECT * FROM forum_reports WHERE id = ?').get(String(reportId).slice(0, 64));
    if (!r) throw notFound();
    if (del) remove(staffId, r.target_type, r.target_id);
    db().prepare('UPDATE forum_reports SET resolved_at = ? WHERE target_type = ? AND target_id = ? AND resolved_at IS NULL')
      .run(new Date().toISOString(), r.target_type, r.target_id); // every report on the same target closes together
    return { ok: true };
  })();
}

module.exports = {
  ForumError, CATEGORIES, TITLE_MAX, BODY_MAX, REASON_MAX, isAdmin, cleanText,
  listThreads, getThread, createThread, reply, remove, report, openReports, resolveReport,
};
