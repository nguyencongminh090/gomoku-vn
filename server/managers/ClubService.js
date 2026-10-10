'use strict';

/**
 * ClubService — clubs, membership and roles (#178).
 *
 * Rules (planning Q5, decided 2026-10-09): any member may create; owner picks
 * 'open' | 'invite' per club; max 500 members per club, 3 clubs per user;
 * roles owner > officer > member. Every mutation runs in one SQLite
 * transaction so the caps can't be raced past.
 *
 * Methods throw ClubError(code, status); routes translate it to JSON.
 */

const crypto = require('crypto');
const database = require('../db/database');
const { CATEGORIES } = require('./RatingService');
const dmText = require('./DmText');

const MAX_MEMBERS = 500;
const MAX_CLUBS_PER_USER = 3;
const MAX_PENDING_PER_USER = 10;
const NAME_MIN = 3;
const NAME_MAX = 30;
const DESC_MAX = 280;
const POLICIES = ['open', 'invite'];
const EVENT_TITLE_MAX = 60;
const MAX_UPCOMING_EVENTS = 20;
const CHAT_PAGE = 50;
const CHAT_KEEP = 200;

class ClubError extends Error {
  constructor(code, status, message) {
    super(message || code);
    this.code = code;
    this.status = status;
  }
}

const db = () => database.db;
const now = () => new Date().toISOString();

/** "CLB Caro Hà Nội" → "clb-caro-ha-noi" */
function slugify(name) {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getClub(slug) {
  const club = db().prepare('SELECT * FROM clubs WHERE slug = ?').get(String(slug).toLowerCase().slice(0, 60));
  if (!club) throw new ClubError('CLUB_NOT_FOUND', 404, 'Không tìm thấy câu lạc bộ.');
  return club;
}

function roleOf(clubId, userId) {
  if (!userId) return null;
  const r = db().prepare('SELECT role FROM club_members WHERE club_id = ? AND user_id = ?').get(clubId, userId);
  return r ? r.role : null;
}

const isStaff = (role) => role === 'owner' || role === 'officer';
const countMembers = (clubId) =>
  db().prepare("SELECT COUNT(*) AS n FROM club_members WHERE club_id = ? AND role != 'pending'").get(clubId).n;
const countUserClubs = (userId) =>
  db().prepare("SELECT COUNT(*) AS n FROM club_members WHERE user_id = ? AND role != 'pending'").get(userId).n;

function validateText({ name, description }, { requireName }) {
  const out = {};
  if (requireName || name !== undefined) {
    const n = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
    if (n.length < NAME_MIN || n.length > NAME_MAX || !slugify(n)) {
      throw new ClubError('CLUB_NAME_INVALID', 400, `Tên CLB dài ${NAME_MIN}–${NAME_MAX} ký tự.`);
    }
    out.name = n;
  }
  if (description !== undefined) {
    if (typeof description !== 'string' || description.length > DESC_MAX) {
      throw new ClubError('CLUB_DESC_INVALID', 400, `Mô tả tối đa ${DESC_MAX} ký tự.`);
    }
    out.description = description.trim();
  }
  return out;
}

// ---------------------------------------------------------------------------
// Create / edit / delete
// ---------------------------------------------------------------------------

function createClub(userId, input) {
  const text = validateText(input, { requireName: true });
  const { name } = text;
  const description = text.description || '';
  const policy = input.joinPolicy === undefined ? 'open' : input.joinPolicy;
  if (!POLICIES.includes(policy)) throw new ClubError('CLUB_POLICY_INVALID', 400, 'Chính sách tham gia không hợp lệ.');
  const slug = slugify(name);

  return db().transaction(() => {
    if (countUserClubs(userId) >= MAX_CLUBS_PER_USER) {
      throw new ClubError('CLUB_LIMIT', 409, `Mỗi người chỉ ở tối đa ${MAX_CLUBS_PER_USER} CLB.`);
    }
    if (db().prepare('SELECT 1 FROM clubs WHERE slug = ?').get(slug)) {
      throw new ClubError('CLUB_NAME_TAKEN', 409, 'Tên CLB đã được dùng.');
    }
    const id = crypto.randomUUID();
    db().prepare('INSERT INTO clubs (id, slug, name, description, join_policy, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, slug, name, description, policy, userId, now());
    db().prepare("INSERT INTO club_members (club_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)").run(id, userId, now());
    return { slug };
  })();
}

function updateClub(userId, slug, input) {
  const club = getClub(slug);
  const role = roleOf(club.id, userId);
  if (!isStaff(role)) throw new ClubError('CLUB_FORBIDDEN', 403, 'Bạn không có quyền.');
  const text = validateText({ description: input.description }, {});
  if (input.joinPolicy !== undefined) {
    if (role !== 'owner') throw new ClubError('CLUB_FORBIDDEN', 403, 'Chỉ chủ nhiệm đổi chính sách tham gia.');
    if (!POLICIES.includes(input.joinPolicy)) throw new ClubError('CLUB_POLICY_INVALID', 400, 'Chính sách tham gia không hợp lệ.');
    db().prepare('UPDATE clubs SET join_policy = ? WHERE id = ?').run(input.joinPolicy, club.id);
  }
  if (text.description !== undefined) {
    db().prepare('UPDATE clubs SET description = ? WHERE id = ?').run(text.description, club.id);
  }
}

function deleteClub(userId, slug) {
  const club = getClub(slug);
  if (roleOf(club.id, userId) !== 'owner') throw new ClubError('CLUB_FORBIDDEN', 403, 'Chỉ chủ nhiệm xoá được CLB.');
  db().prepare('DELETE FROM clubs WHERE id = ?').run(club.id); // members cascade
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

/** @returns {'member'|'pending'} resulting role */
function join(userId, slug) {
  return db().transaction(() => {
    const club = getClub(slug);
    if (roleOf(club.id, userId)) throw new ClubError('CLUB_ALREADY_MEMBER', 409, 'Bạn đã ở trong CLB này.');
    if (club.join_policy === 'open') {
      if (countUserClubs(userId) >= MAX_CLUBS_PER_USER) throw new ClubError('CLUB_LIMIT', 409, `Mỗi người chỉ ở tối đa ${MAX_CLUBS_PER_USER} CLB.`);
      if (countMembers(club.id) >= MAX_MEMBERS) throw new ClubError('CLUB_FULL', 409, 'CLB đã đủ thành viên.');
      db().prepare("INSERT INTO club_members (club_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").run(club.id, userId, now());
      return 'member';
    }
    const pending = db().prepare("SELECT COUNT(*) AS n FROM club_members WHERE user_id = ? AND role = 'pending'").get(userId).n;
    if (pending >= MAX_PENDING_PER_USER) throw new ClubError('CLUB_PENDING_LIMIT', 409, 'Bạn có quá nhiều yêu cầu đang chờ.');
    db().prepare("INSERT INTO club_members (club_id, user_id, role, joined_at) VALUES (?, ?, 'pending', ?)").run(club.id, userId, now());
    return 'pending';
  })();
}

/** Leave, or cancel a pending request. The owner must transfer or delete instead. */
function leave(userId, slug) {
  const club = getClub(slug);
  const role = roleOf(club.id, userId);
  if (!role) throw new ClubError('CLUB_NOT_MEMBER', 404, 'Bạn không ở trong CLB này.');
  if (role === 'owner') throw new ClubError('CLUB_OWNER_LEAVE', 409, 'Chủ nhiệm cần chuyển quyền hoặc xoá CLB trước.');
  db().prepare('DELETE FROM club_members WHERE club_id = ? AND user_id = ?').run(club.id, userId);
}

function approve(actorId, slug, targetId) {
  db().transaction(() => {
    const club = getClub(slug);
    if (!isStaff(roleOf(club.id, actorId))) throw new ClubError('CLUB_FORBIDDEN', 403, 'Bạn không có quyền.');
    if (roleOf(club.id, targetId) !== 'pending') throw new ClubError('CLUB_NOT_PENDING', 404, 'Không có yêu cầu này.');
    if (countMembers(club.id) >= MAX_MEMBERS) throw new ClubError('CLUB_FULL', 409, 'CLB đã đủ thành viên.');
    if (countUserClubs(targetId) >= MAX_CLUBS_PER_USER) throw new ClubError('CLUB_TARGET_LIMIT', 409, 'Người này đã ở đủ số CLB tối đa.');
    db().prepare("UPDATE club_members SET role = 'member', joined_at = ? WHERE club_id = ? AND user_id = ?").run(now(), club.id, targetId);
  })();
}

/** Reject a request or kick a member. Officers can't touch other staff; nobody removes the owner. */
function remove(actorId, slug, targetId) {
  const club = getClub(slug);
  const actor = roleOf(club.id, actorId);
  const target = roleOf(club.id, targetId);
  if (!isStaff(actor)) throw new ClubError('CLUB_FORBIDDEN', 403, 'Bạn không có quyền.');
  if (!target) throw new ClubError('CLUB_NOT_MEMBER', 404, 'Người này không ở trong CLB.');
  if (target === 'owner' || (isStaff(target) && actor !== 'owner')) {
    throw new ClubError('CLUB_FORBIDDEN', 403, 'Bạn không có quyền với người này.');
  }
  db().prepare('DELETE FROM club_members WHERE club_id = ? AND user_id = ?').run(club.id, targetId);
}

/** Owner only: 'officer' | 'member' | 'owner' (transfer — old owner becomes officer). */
function setRole(actorId, slug, targetId, newRole) {
  db().transaction(() => {
    const club = getClub(slug);
    if (roleOf(club.id, actorId) !== 'owner') throw new ClubError('CLUB_FORBIDDEN', 403, 'Chỉ chủ nhiệm đổi vai trò.');
    if (!['officer', 'member', 'owner'].includes(newRole)) throw new ClubError('CLUB_ROLE_INVALID', 400, 'Vai trò không hợp lệ.');
    const target = roleOf(club.id, targetId);
    if (!target || target === 'pending') throw new ClubError('CLUB_NOT_MEMBER', 404, 'Người này không phải thành viên.');
    if (targetId === actorId) throw new ClubError('CLUB_ROLE_INVALID', 400, 'Không thể đổi vai trò của chính mình.');
    if (newRole === 'owner') {
      db().prepare("UPDATE club_members SET role = 'officer' WHERE club_id = ? AND user_id = ?").run(club.id, actorId);
      db().prepare('UPDATE clubs SET owner_id = ? WHERE id = ?').run(targetId, club.id);
    }
    db().prepare('UPDATE club_members SET role = ? WHERE club_id = ? AND user_id = ?').run(newRole, club.id, targetId);
  })();
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function avgRatingSql() {
  return `(SELECT ROUND(AVG(r.rating)) FROM club_members m JOIN ratings r ON r.user_id = m.user_id
           WHERE m.club_id = c.id AND m.role != 'pending' AND r.category = ? AND r.games >= ?)`;
}

/**
 * "Hạng CLB": clubs ordered by the average rating of their ranked members
 * (≥ RANKING_MIN_GAMES games) in a category; clubs with no ranked member have no
 * rank. Ties → more members, then slug.
 * @returns {Map<string, number>} club id → 1-based rank
 */
function clubRanks(category) {
  const rows = db().prepare(`
    SELECT c.id, c.slug, AVG(r.rating) AS avg,
           (SELECT COUNT(*) FROM club_members x WHERE x.club_id = c.id AND x.role != 'pending') AS members
    FROM clubs c
    JOIN club_members m ON m.club_id = c.id AND m.role != 'pending'
    JOIN ratings r ON r.user_id = m.user_id AND r.category = ? AND r.games >= ?
    GROUP BY c.id
    ORDER BY avg DESC, members DESC, c.slug`).all(category, database.RANKING_MIN_GAMES);
  return new Map(rows.map((r, i) => [r.id, i + 1]));
}

/** Discover list: newest/biggest first, optional name search. */
function listClubs({ q, page, limit, category }) {
  const where = q ? "WHERE c.name LIKE ? ESCAPE '\\'" : '';
  const like = q ? [`%${q.replace(/[\\%_]/g, '\\$&')}%`] : [];
  const total = db().prepare(`SELECT COUNT(*) AS n FROM clubs c ${where}`).get(...like).n;
  const rows = db().prepare(`
    SELECT c.id, c.slug, c.name, c.description, c.join_policy,
           (SELECT COUNT(*) FROM club_members m WHERE m.club_id = c.id AND m.role != 'pending') AS members,
           ${avgRatingSql()} AS avg_rating
    FROM clubs c ${where}
    ORDER BY members DESC, c.created_at DESC
    LIMIT ? OFFSET ?`).all(category, database.RANKING_MIN_GAMES, ...like, limit, (page - 1) * limit);
  const ranks = clubRanks(category);
  return { total, clubs: rows.map((r) => ({
    slug: r.slug, name: r.name, description: r.description, joinPolicy: r.join_policy,
    members: r.members, avgRating: r.avg_rating, rank: ranks.get(r.id) || null,
  })) };
}

/** Club page payload; pending requests are visible to staff only. */
/** Upcoming events (starts_at >= now), soonest first, capped. */
function upcomingEvents(clubId) {
  return db().prepare(`
    SELECT id, title, starts_at, kind FROM club_events
    WHERE club_id = ? AND starts_at >= ? ORDER BY starts_at, id LIMIT ?`)
    .all(clubId, new Date().toISOString(), MAX_UPCOMING_EVENTS)
    .map((e) => ({ id: e.id, title: e.title, startsAt: e.starts_at, kind: e.kind }));
}

function requireStaff(club, userId) {
  if (!isStaff(roleOf(club.id, userId))) throw new ClubError('CLUB_FORBIDDEN', 403, 'Bạn không có quyền.');
}

function createEvent(userId, slug, { title, startsAt }) {
  return db().transaction(() => {
    const club = getClub(slug);
    requireStaff(club, userId);
    const name = typeof title === 'string' ? title.trim() : '';
    if (!name || name.length > EVENT_TITLE_MAX) {
      throw new ClubError('CLUB_EVENT_TITLE_INVALID', 400, `Tên sự kiện dài 1–${EVENT_TITLE_MAX} ký tự.`);
    }
    const when = typeof startsAt === 'string' ? new Date(startsAt) : null;
    if (!when || Number.isNaN(when.getTime()) || when.getTime() < Date.now()) {
      throw new ClubError('CLUB_EVENT_TIME_INVALID', 400, 'Thời gian sự kiện phải ở tương lai.');
    }
    if (upcomingEvents(club.id).length >= MAX_UPCOMING_EVENTS) {
      throw new ClubError('CLUB_EVENT_LIMIT', 409, `Tối đa ${MAX_UPCOMING_EVENTS} sự kiện sắp tới.`);
    }
    const id = crypto.randomUUID();
    db().prepare('INSERT INTO club_events (id, club_id, title, starts_at, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, club.id, name, when.toISOString(), userId, new Date().toISOString());
    return { id };
  })();
}

function deleteEvent(userId, slug, eventId) {
  const club = getClub(slug);
  requireStaff(club, userId);
  const r = db().prepare('DELETE FROM club_events WHERE id = ? AND club_id = ?').run(String(eventId).slice(0, 64), club.id);
  if (!r.changes) throw new ClubError('CLUB_EVENT_NOT_FOUND', 404, 'Không tìm thấy sự kiện.');
}

function requireMember(club, userId) {
  const role = roleOf(club.id, userId);
  if (!role || role === 'pending') throw new ClubError('CLUB_CHAT_MEMBERS_ONLY', 403, 'Chỉ thành viên mới dùng được trò chuyện.');
  return role;
}

const avatarOf = (id, v) => (v ? `/api/profile/avatar/${id}.webp?v=${v}` : null);

/**
 * Members only. No cursor → newest page; `before` → older page; `after` → newer
 * (polling). Always returned oldest → newest.
 */
function listMessages(userId, slug, { before, after } = {}) {
  const club = getClub(slug);
  requireMember(club, userId);
  const b = Number.parseInt(before, 10);
  const a = Number.parseInt(after, 10);
  let where = 'm.club_id = ?';
  const args = [club.id];
  let order = 'DESC';
  if (a > 0) { where += ' AND m.id > ?'; args.push(a); order = 'ASC'; } else if (b > 0) { where += ' AND m.id < ?'; args.push(b); }
  const rows = db().prepare(`
    SELECT m.id, m.sender_id, m.body, m.created_at, u.username, u.display_name, u.avatar_v
    FROM club_messages m JOIN users u ON u.id = m.sender_id
    WHERE ${where} ORDER BY m.id ${order} LIMIT ?`).all(...args, CHAT_PAGE);
  if (order === 'DESC') rows.reverse();
  return rows.map((r) => ({
    id: r.id, text: r.body, createdAt: r.created_at, mine: r.sender_id === userId,
    username: r.username, displayName: r.display_name, avatarUrl: avatarOf(r.sender_id, r.avatar_v),
  }));
}

function postMessage(userId, slug, text) {
  const club = getClub(slug);
  requireMember(club, userId);
  const body = dmText.clean(typeof text === 'string' ? text : '');
  if (!body) throw new ClubError('CLUB_MESSAGE_EMPTY', 400, 'Tin nhắn trống.');
  if (dmText.isRateLimited(userId)) throw new ClubError('CLUB_CHAT_RATE_LIMITED', 429, 'Bạn nhắn quá nhanh.');
  return db().transaction(() => {
    const { lastInsertRowid } = db().prepare('INSERT INTO club_messages (club_id, sender_id, body, created_at) VALUES (?, ?, ?, ?)')
      .run(club.id, userId, body, new Date().toISOString());
    db().prepare(`DELETE FROM club_messages WHERE club_id = ? AND id <= (
      SELECT id FROM club_messages WHERE club_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)`).run(club.id, club.id, CHAT_KEEP);
    return { id: Number(lastInsertRowid) };
  })();
}

function deleteMessage(userId, slug, messageId) {
  const club = getClub(slug);
  requireStaff(club, userId);
  const r = db().prepare('DELETE FROM club_messages WHERE id = ? AND club_id = ?').run(Number.parseInt(messageId, 10) || 0, club.id);
  if (!r.changes) throw new ClubError('CLUB_MESSAGE_NOT_FOUND', 404, 'Không tìm thấy tin nhắn.');
}

function getClubDetail(slug, viewerId, category) {
  if (!CATEGORIES.includes(category)) category = CATEGORIES[0];
  const club = getClub(slug);
  const myRole = roleOf(club.id, viewerId);
  const rows = db().prepare(`
    SELECT m.user_id, m.role, u.username, u.display_name, u.avatar_v, r.rating, r.rd, r.games
    FROM club_members m
    JOIN users u ON u.id = m.user_id
    LEFT JOIN ratings r ON r.user_id = m.user_id AND r.category = ?
    WHERE m.club_id = ? AND m.role != 'pending'
    ORDER BY r.rating IS NULL, r.rating DESC, m.joined_at, m.user_id`).all(category, club.id);

  const avgRows = rows.filter((r) => r.rating != null && r.games >= database.RANKING_MIN_GAMES);
  const body = {
    slug: club.slug, name: club.name, description: club.description, joinPolicy: club.join_policy,
    createdAt: club.created_at, category,
    members: rows.length,
    rank: clubRanks(category).get(club.id) || null,
    avgRating: avgRows.length ? Math.round(avgRows.reduce((s, r) => s + r.rating, 0) / avgRows.length) : null,
    myRole,
    events: upcomingEvents(club.id),
    leaderboard: rows.map((r, i) => ({
      rank: i + 1, username: r.username, displayName: r.display_name, role: r.role,
      avatarUrl: r.avatar_v ? `/api/profile/avatar/${r.user_id}.webp?v=${r.avatar_v}` : null,
      rating: r.rating == null ? null : Math.round(r.rating), games: r.games || 0,
    })),
  };
  if (isStaff(myRole)) {
    body.pending = db().prepare(`
      SELECT u.username, u.display_name FROM club_members m JOIN users u ON u.id = m.user_id
      WHERE m.club_id = ? AND m.role = 'pending' ORDER BY m.joined_at`).all(club.id)
      .map((p) => ({ username: p.username, displayName: p.display_name }));
  }
  return body;
}

function clubsOfUser(userId) {
  return db().prepare(`
    SELECT c.slug, c.name, m.role,
           (SELECT COUNT(*) FROM club_members x WHERE x.club_id = c.id AND x.role != 'pending') AS members
    FROM club_members m JOIN clubs c ON c.id = m.club_id
    WHERE m.user_id = ? AND m.role != 'pending' ORDER BY m.joined_at`).all(userId)
    .map((r) => ({ slug: r.slug, name: r.name, role: r.role, members: r.members }));
}

function userIdByUsername(username) {
  const u = database.getProfileByUsername(String(username).slice(0, 40));
  return u ? u.id : null;
}

module.exports = {
  ClubError, MAX_MEMBERS, MAX_CLUBS_PER_USER, slugify,
  createClub, updateClub, deleteClub, join, leave, approve, remove, setRole,
  createEvent, deleteEvent, listMessages, postMessage, deleteMessage,
  listClubs, getClubDetail, clubsOfUser, userIdByUsername,
};
