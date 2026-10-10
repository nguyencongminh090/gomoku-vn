'use strict';

/**
 * AdminUserService.js — staff user management (R8 8b, #206). Every change is also written as a
 * directed edge actor → target in `admin_edges`, so history is a graph: node = user, edge = action.
 * Permission `user.manage` (admin only) is checked here, not just in the route.
 */

const crypto = require('crypto');
const database = require('../db/database');
const roles = require('../utils/roles');
const sessions = require('./SessionManager');
const avatarStore = require('../utils/avatar-store');

const db = () => database.db;
const PAGE = 20;
const EDGE_LIMIT = 50;
const REASON_MAX = 200;
const ACTIONS = ['role_set', 'lock', 'unlock', 'avatar_remove'];

class AdminUserError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'AdminUserError';
    this.code = code;
    this.status = status;
  }
}
const bad = (code, message) => new AdminUserError(code, 400, message);

function requireManager(userId) {
  if (!roles.can(userId, 'user.manage')) throw new AdminUserError('ADMIN_FORBIDDEN', 403, 'Bạn không có quyền.');
}

const shape = (r) => ({
  id: r.id, username: r.username, displayName: r.display_name, role: ROLE(r.role),
  locked: !!r.locked_at, lockedAt: r.locked_at || null, createdAt: r.created_at, lastLoginAt: r.last_login_at || null,
  google: r.oauth_provider === 'google',
  avatarUrl: r.avatar_v ? `/api/profile/avatar/${r.id}.webp?v=${r.avatar_v}` : null,
});
const ROLE = (v) => (roles.ROLES.includes(v) ? v : 'member');
const COLS = 'id, username, display_name, role, locked_at, created_at, last_login_at, oauth_provider, avatar_v';

function findUser(id) {
  const row = db().prepare(`SELECT ${COLS} FROM users WHERE id = ?`).get(String(id).slice(0, 64));
  if (!row) throw new AdminUserError('ADMIN_USER_NOT_FOUND', 404, 'Không tìm thấy người dùng.');
  return row;
}

const escapeLike = (s) => s.replace(/[\\%_]/g, (c) => '\\' + c);

function listUsers(adminId, { q, page } = {}) {
  requireManager(adminId);
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const term = typeof q === 'string' ? q.trim().slice(0, 50) : '';
  const where = term ? "WHERE username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\'" : '';
  const params = term ? [`%${escapeLike(term)}%`, `%${escapeLike(term)}%`] : [];
  const total = db().prepare(`SELECT COUNT(*) AS n FROM users ${where}`).get(...params).n;
  const rows = db().prepare(`SELECT ${COLS} FROM users ${where} ORDER BY created_at DESC, id LIMIT ? OFFSET ?`).all(...params, PAGE, (pg - 1) * PAGE);
  return { users: rows.map(shape), pagination: { page: pg, limit: PAGE, total, totalPages: Math.ceil(total / PAGE) } };
}

/** One user + the 1-hop change graph around them (newest EDGE_LIMIT edges, with the neighbour nodes). */
function getUser(adminId, id) {
  requireManager(adminId);
  const user = findUser(id);
  const rows = db().prepare('SELECT * FROM admin_edges WHERE actor_id = ? OR target_id = ? ORDER BY created_at DESC, id LIMIT ?').all(user.id, user.id, EDGE_LIMIT);
  const ids = [...new Set([user.id, ...rows.flatMap((e) => [e.actor_id, e.target_id])])];
  const found = db().prepare(`SELECT ${COLS} FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  const byId = new Map(found.map((u) => [u.id, u]));
  const nodes = ids.map((nid) => {
    const u = byId.get(nid);
    return { id: nid, name: u ? u.display_name : '(đã xoá)', role: u ? ROLE(u.role) : null, deleted: !u };
  });
  const edges = rows.map((e) => ({ id: e.id, from: e.actor_id, to: e.target_id, action: e.action, detail: JSON.parse(e.detail || '{}'), at: e.created_at }));
  return { user: shape(user), nodes, edges };
}

function addEdge(actorId, action, targetId, detail) {
  db().prepare('INSERT INTO admin_edges (id, actor_id, action, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(crypto.randomUUID(), actorId, action, targetId, JSON.stringify(detail), new Date().toISOString());
}

function setRole(adminId, id, role) {
  requireManager(adminId);
  if (!roles.ROLES.includes(role)) throw bad('ADMIN_ROLE_INVALID', 'Vai trò không hợp lệ.');
  return db().transaction(() => {
    const user = findUser(id);
    if (user.id === adminId) throw bad('ADMIN_SELF_FORBIDDEN', 'Không thể tự đổi vai trò của mình.');
    const from = ROLE(user.role);
    if (from !== role) {
      db().prepare('UPDATE users SET role = ? WHERE id = ?').run(role, user.id);
      addEdge(adminId, 'role_set', user.id, { from, to: role });
    }
    return shape({ ...user, role });
  })();
}

function setLocked(adminId, id, locked, reason) {
  requireManager(adminId);
  const why = typeof reason === 'string' ? reason.trim() : '';
  if (locked && !why) throw bad('ADMIN_REASON_REQUIRED', 'Cần ghi lý do khoá.');
  if (why.length > REASON_MAX) throw bad('ADMIN_REASON_REQUIRED', `Lý do tối đa ${REASON_MAX} ký tự.`);
  const out = db().transaction(() => {
    const user = findUser(id);
    if (user.id === adminId) throw bad('ADMIN_SELF_FORBIDDEN', 'Không thể tự khoá tài khoản của mình.');
    if (locked && ROLE(user.role) === 'admin') throw bad('ADMIN_TARGET_PROTECTED', 'Hãy hạ vai trò quản trị viên trước khi khoá.');
    if (!!user.locked_at !== !!locked) {
      const at = locked ? new Date().toISOString() : null;
      db().prepare('UPDATE users SET locked_at = ? WHERE id = ?').run(at, user.id);
      addEdge(adminId, locked ? 'lock' : 'unlock', user.id, why ? { reason: why } : {});
      return shape({ ...user, locked_at: at });
    }
    return shape(user);
  })();
  if (locked) sessions.revokeOtherSessionsForUser(out.id); // evicts every live session (no exception)
  return out;
}

/** Staff removal of a user's avatar: file + avatar_v cleared, one edge. Idempotent (no avatar → no edge). */
function removeAvatar(adminId, id) {
  requireManager(adminId);
  return db().transaction(() => {
    const user = findUser(id);
    if (user.avatar_v) {
      database.setAvatarVersion(user.id, true);
      avatarStore.removeFile(user.id);
      addEdge(adminId, 'avatar_remove', user.id, {});
    }
    return shape({ ...user, avatar_v: 0 });
  })();
}

module.exports = { AdminUserError, ACTIONS, REASON_MAX, listUsers, getUser, setRole, setLocked, removeAvatar };
