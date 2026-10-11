'use strict';

/**
 * NewsService — admin-written dashboard announcements (TODO.md #224).
 *
 * Admin only (perm news.manage) for list/create/edit/delete; anyone reads the newest one via
 * latest() (the /api/home payload). Plain text: control chars stripped, stored as typed, rendered
 * with textContent — never HTML. `link` is an optional same-site path so a news line can point at
 * a forum thread or a tournament without ever becoming an off-site redirect.
 *
 * Methods throw NewsError(code, status); routes translate it to JSON.
 */

const crypto = require('crypto');
const database = require('../db/database');
const roles = require('../utils/roles');

const db = () => database.db;
const BODY_MAX = 200;
const LINK_MAX = 200;
const LIST_LIMIT = 50;

class NewsError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'NewsError';
    this.code = code;
    this.status = status;
  }
}
const bad = (code, message) => new NewsError(code, 400, message);

function requireAdmin(userId) {
  if (!roles.can(userId, 'news.manage')) throw new NewsError('NEWS_FORBIDDEN', 403, 'Bạn không có quyền.');
}

/** One line: control chars and newlines → single spaces, trimmed. */
function cleanBody(raw) {
  // eslint-disable-next-line no-control-regex
  return typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/ {2,}/g, ' ').trim() : '';
}

/** '' / null → null; otherwise a same-site absolute path ("/x", not "//host" or "/\host"), no whitespace. */
function cleanLink(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s || s.length > LINK_MAX || !/^\/(?![/\\])[^\s\\]*$/.test(s)) throw bad('NEWS_LINK_INVALID', 'Liên kết phải là đường dẫn trong trang, bắt đầu bằng "/".');
  return s;
}

function validBody(raw) {
  const body = cleanBody(raw);
  if (!body || body.length > BODY_MAX) throw bad('NEWS_BODY_INVALID', `Nội dung dài 1–${BODY_MAX} ký tự.`);
  return body;
}

const shape = (r) => ({ id: r.id, body: r.body, link: r.link || null, createdAt: r.created_at, updatedAt: r.updated_at });

/** Newest item for the dashboard, or null. Public. */
function latest() {
  const r = db().prepare('SELECT * FROM news ORDER BY created_at DESC, id DESC LIMIT 1').get();
  return r ? shape(r) : null;
}

function list(adminId) {
  requireAdmin(adminId);
  return { items: db().prepare('SELECT * FROM news ORDER BY created_at DESC, id DESC LIMIT ?').all(LIST_LIMIT).map(shape) };
}

function create(adminId, { body, link } = {}) {
  requireAdmin(adminId);
  const b = validBody(body);
  const l = cleanLink(link);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db().prepare('INSERT INTO news (id, body, link, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, b, l, adminId, now, now);
  return shape(db().prepare('SELECT * FROM news WHERE id = ?').get(id));
}

function update(adminId, id, { body, link } = {}) {
  requireAdmin(adminId);
  const b = validBody(body);
  const l = cleanLink(link);
  const info = db().prepare('UPDATE news SET body = ?, link = ?, updated_at = ? WHERE id = ?').run(b, l, new Date().toISOString(), String(id).slice(0, 64));
  if (!info.changes) throw new NewsError('NEWS_NOT_FOUND', 404, 'Không tìm thấy tin.');
  return shape(db().prepare('SELECT * FROM news WHERE id = ?').get(String(id).slice(0, 64)));
}

function remove(adminId, id) {
  requireAdmin(adminId);
  const info = db().prepare('DELETE FROM news WHERE id = ?').run(String(id).slice(0, 64));
  if (!info.changes) throw new NewsError('NEWS_NOT_FOUND', 404, 'Không tìm thấy tin.');
  return { ok: true };
}

module.exports = { NewsError, BODY_MAX, latest, list, create, update, remove };
