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
const { KINDS, removeImage } = require('../utils/club-image-store');
const notifications = require('./NotificationService');
const chat = require('./ClubChatCommands');
const { PRESETS } = require('./MatchQueue');
const { WINNING_RULES } = require('./rules');

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
const LOG_KEEP = 500;
const COLORS = ['blue', 'green', 'red', 'orange', 'purple', 'teal', 'pink', 'gray'];
const TAG_RE = /^[\p{L}\p{N}]{2,4}$/u;
const MAX_INVITES = 50;
const HISTORY_SHOWN = 30;
const WEEKLY_SHOWN = 20;
const WEEK_MS = 7 * 24 * 3600 * 1000;
const NOTIFY_COOLDOWN_MS = 10 * 60 * 1000; // per club: one @all and one pin fan-out per 10 min (B447)
const CHALLENGE_DEFAULTS = { rule: 'freestyle', time: '5+3' }; // /giaohuu with no extras (unrated)
const POLL_OPEN_MS = 24 * 3600 * 1000; // B449: a poll closes 24 h after creation (or earlier by creator/staff)
const MAX_OPEN_POLLS = 3;              // per creator per club
const POLL_REFRESH_MAX = 20;           // poll ids one chat tick may refresh
const POLL_ERRORS = {
  usage: 'Cú pháp: /binhchon Câu hỏi | Lựa chọn 1 | Lựa chọn 2.',
  too_few: 'Bình chọn cần ít nhất 2 lựa chọn.',
  too_many: 'Bình chọn có tối đa 6 lựa chọn.',
  too_long: 'Câu hỏi tối đa 140 ký tự, mỗi lựa chọn tối đa 50 ký tự.',
  duplicate: 'Các lựa chọn không được trùng nhau.',
};

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
  if (!club) throw new ClubError('CLUB_NOT_FOUND', 404, 'Không tìm thấy hội nhóm.');
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

function log(clubId, type, actorId, targetId, detail = '') {
  db().prepare('INSERT INTO club_log (club_id, type, actor_id, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(clubId, type, actorId || null, targetId || null, detail, now());
  db().prepare(`DELETE FROM club_log WHERE club_id = ? AND id <= (
    SELECT id FROM club_log WHERE club_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)`).run(clubId, clubId, LOG_KEEP);
}

/** Owner + officers of a club. */
const staffIds = (clubId) =>
  db().prepare("SELECT user_id FROM club_members WHERE club_id = ? AND role IN ('owner','officer')").all(clubId).map((r) => r.user_id);

function notify(userId, type, actorId, club) {
  const me = actorId ? database.getUserById(actorId) : null;
  notifications.push(userId, type, actorId, {
    club: { slug: club.slug, name: club.name },
    ...(me ? { from: { username: me.username, displayName: me.display_name } } : {}),
  });
}

/** Identity fields (#235). Each is optional; invalid → 400. */
function validateIdentity({ color, tag, announcement }) {
  const out = {};
  if (color !== undefined) {
    if (!COLORS.includes(color)) throw new ClubError('CLUB_COLOR_INVALID', 400, 'Màu không hợp lệ.');
    out.color = color;
  }
  if (tag !== undefined) {
    const v = typeof tag === 'string' ? tag.trim().toUpperCase() : '';
    if (v && !TAG_RE.test(v)) throw new ClubError('CLUB_TAG_INVALID', 400, 'Ký hiệu nhóm gồm 2–4 chữ hoặc số.');
    out.tag = v;
  }
  if (announcement !== undefined) {
    if (typeof announcement !== 'string' || announcement.length > DESC_MAX) {
      throw new ClubError('CLUB_ANNOUNCEMENT_INVALID', 400, `Thông báo tối đa ${DESC_MAX} ký tự.`);
    }
    out.announcement = announcement.trim();
  }
  return out;
}

function validateText({ name, description }, { requireName }) {
  const out = {};
  if (requireName || name !== undefined) {
    const n = typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : '';
    if (n.length < NAME_MIN || n.length > NAME_MAX || !slugify(n)) {
      throw new ClubError('CLUB_NAME_INVALID', 400, `Tên nhóm dài ${NAME_MIN}–${NAME_MAX} ký tự.`);
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
  const ident = validateIdentity({ color: input.color, tag: input.tag });

  return db().transaction(() => {
    if (countUserClubs(userId) >= MAX_CLUBS_PER_USER) {
      throw new ClubError('CLUB_LIMIT', 409, `Mỗi người chỉ ở tối đa ${MAX_CLUBS_PER_USER} nhóm.`);
    }
    if (db().prepare('SELECT 1 FROM clubs WHERE slug = ?').get(slug)) {
      throw new ClubError('CLUB_NAME_TAKEN', 409, 'Tên nhóm đã được dùng.');
    }
    const id = crypto.randomUUID();
    db().prepare('INSERT INTO clubs (id, slug, name, description, join_policy, owner_id, created_at, color, tag) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, slug, name, description, policy, userId, now(), ident.color || 'blue', ident.tag || '');
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
  const ident = validateIdentity(input);
  for (const k of ['color', 'tag', 'announcement']) {
    if (ident[k] !== undefined) db().prepare(`UPDATE clubs SET ${k} = ? WHERE id = ?`).run(ident[k], club.id);
  }
  if (input.chatSettings !== undefined) {
    const merged = chat.mergeSettings(chat.readSettings(club.chat_settings), input.chatSettings);
    if (!merged) throw new ClubError('CLUB_CHAT_SETTINGS_INVALID', 400, 'Cài đặt trò chuyện không hợp lệ.');
    db().prepare('UPDATE clubs SET chat_settings = ? WHERE id = ?').run(JSON.stringify(merged), club.id);
  }
}

const imageUrl = (slug, kind, v) => (v ? `/api/clubs/${slug}/${kind}?v=${v}` : null);

/** Staff gate for avatar/banner changes; returns the club row. */
function clubForImageEdit(userId, slug) {
  const club = getClub(slug);
  requireStaff(club, userId);
  return club;
}

/** Record that the file for `kind` changed (or was removed); returns its new URL (null when removed). */
function setImageVersion(club, kind, clear) {
  const col = kind === 'avatar' ? 'avatar_v' : 'banner_v';
  const v = clear ? 0 : Date.now() % 2147483647;
  db().prepare(`UPDATE clubs SET ${col} = ? WHERE id = ?`).run(v, club.id);
  return imageUrl(club.slug, kind, v);
}

function deleteClub(userId, slug) {
  const club = getClub(slug);
  if (roleOf(club.id, userId) !== 'owner') throw new ClubError('CLUB_FORBIDDEN', 403, 'Chỉ chủ nhiệm xoá được nhóm.');
  db().prepare('DELETE FROM clubs WHERE id = ?').run(club.id); // members cascade
  for (const kind of Object.keys(KINDS)) removeImage(club.id, kind);
}

// ---------------------------------------------------------------------------
// Membership
// ---------------------------------------------------------------------------

/** @returns {'member'|'pending'} resulting role */
function join(userId, slug) {
  return db().transaction(() => {
    const club = getClub(slug);
    if (roleOf(club.id, userId)) throw new ClubError('CLUB_ALREADY_MEMBER', 409, 'Bạn đã ở trong nhóm này.');
    const invited = db().prepare('SELECT 1 FROM club_invites WHERE club_id = ? AND user_id = ?').get(club.id, userId);
    if (club.join_policy === 'open' || invited) {
      if (countUserClubs(userId) >= MAX_CLUBS_PER_USER) throw new ClubError('CLUB_LIMIT', 409, `Mỗi người chỉ ở tối đa ${MAX_CLUBS_PER_USER} nhóm.`);
      if (countMembers(club.id) >= MAX_MEMBERS) throw new ClubError('CLUB_FULL', 409, 'Nhóm đã đủ thành viên.');
      db().prepare("INSERT INTO club_members (club_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)").run(club.id, userId, now());
      db().prepare('DELETE FROM club_invites WHERE club_id = ? AND user_id = ?').run(club.id, userId);
      log(club.id, 'join', userId, userId, invited ? 'invited' : '');
      return 'member';
    }
    const pending = db().prepare("SELECT COUNT(*) AS n FROM club_members WHERE user_id = ? AND role = 'pending'").get(userId).n;
    if (pending >= MAX_PENDING_PER_USER) throw new ClubError('CLUB_PENDING_LIMIT', 409, 'Bạn có quá nhiều yêu cầu đang chờ.');
    db().prepare("INSERT INTO club_members (club_id, user_id, role, joined_at) VALUES (?, ?, 'pending', ?)").run(club.id, userId, now());
    for (const id of staffIds(club.id)) notify(id, 'club_request', userId, club);
    return 'pending';
  })();
}

/** Leave, or cancel a pending request. The owner must transfer or delete instead. */
function leave(userId, slug) {
  const club = getClub(slug);
  const role = roleOf(club.id, userId);
  if (!role) throw new ClubError('CLUB_NOT_MEMBER', 404, 'Bạn không ở trong nhóm này.');
  if (role === 'owner') throw new ClubError('CLUB_OWNER_LEAVE', 409, 'Chủ nhiệm cần chuyển quyền hoặc xoá nhóm trước.');
  db().prepare('DELETE FROM club_members WHERE club_id = ? AND user_id = ?').run(club.id, userId);
  if (role === 'pending') {
    for (const id of staffIds(club.id)) notifications.drop(id, 'club_request', userId);
  } else {
    log(club.id, 'leave', userId, userId);
  }
}

function approve(actorId, slug, targetId) {
  db().transaction(() => {
    const club = getClub(slug);
    if (!isStaff(roleOf(club.id, actorId))) throw new ClubError('CLUB_FORBIDDEN', 403, 'Bạn không có quyền.');
    if (roleOf(club.id, targetId) !== 'pending') throw new ClubError('CLUB_NOT_PENDING', 404, 'Không có yêu cầu này.');
    if (countMembers(club.id) >= MAX_MEMBERS) throw new ClubError('CLUB_FULL', 409, 'Nhóm đã đủ thành viên.');
    if (countUserClubs(targetId) >= MAX_CLUBS_PER_USER) throw new ClubError('CLUB_TARGET_LIMIT', 409, 'Người này đã ở đủ số nhóm tối đa.');
    db().prepare("UPDATE club_members SET role = 'member', joined_at = ? WHERE club_id = ? AND user_id = ?").run(now(), club.id, targetId);
    db().prepare('DELETE FROM club_invites WHERE club_id = ? AND user_id = ?').run(club.id, targetId);
    log(club.id, 'approve', actorId, targetId);
    for (const id of staffIds(club.id)) notifications.drop(id, 'club_request', targetId);
    notify(targetId, 'club_approved', actorId, club);
  })();
}

/** Reject a request or kick a member. Officers can't touch other staff; nobody removes the owner. */
function remove(actorId, slug, targetId) {
  const club = getClub(slug);
  const actor = roleOf(club.id, actorId);
  const target = roleOf(club.id, targetId);
  if (!isStaff(actor)) throw new ClubError('CLUB_FORBIDDEN', 403, 'Bạn không có quyền.');
  if (!target) throw new ClubError('CLUB_NOT_MEMBER', 404, 'Người này không ở trong nhóm.');
  if (target === 'owner' || (isStaff(target) && actor !== 'owner')) {
    throw new ClubError('CLUB_FORBIDDEN', 403, 'Bạn không có quyền với người này.');
  }
  db().prepare('DELETE FROM club_members WHERE club_id = ? AND user_id = ?').run(club.id, targetId);
  log(club.id, target === 'pending' ? 'reject' : 'kick', actorId, targetId);
  if (target === 'pending') for (const id of staffIds(club.id)) notifications.drop(id, 'club_request', targetId);
}

/** Staff: invite a user by id. They can then join an 'invite' club without approval (#235). */
function invite(actorId, slug, targetId) {
  return db().transaction(() => {
    const club = getClub(slug);
    requireStaff(club, actorId);
    if (roleOf(club.id, targetId)) throw new ClubError('CLUB_ALREADY_MEMBER', 409, 'Người này đã ở trong nhóm hoặc đang chờ duyệt.');
    const open = db().prepare('SELECT COUNT(*) AS n FROM club_invites WHERE club_id = ?').get(club.id).n;
    if (open >= MAX_INVITES) throw new ClubError('CLUB_INVITE_LIMIT', 409, `Tối đa ${MAX_INVITES} lời mời đang chờ.`);
    db().prepare('INSERT OR REPLACE INTO club_invites (club_id, user_id, invited_by, created_at) VALUES (?, ?, ?, ?)')
      .run(club.id, targetId, actorId, now());
    log(club.id, 'invite', actorId, targetId);
    notify(targetId, 'club_invite', actorId, club);
  })();
}

function revokeInvite(actorId, slug, targetId) {
  const club = getClub(slug);
  requireStaff(club, actorId);
  const r = db().prepare('DELETE FROM club_invites WHERE club_id = ? AND user_id = ?').run(club.id, targetId);
  if (!r.changes) throw new ClubError('CLUB_INVITE_NOT_FOUND', 404, 'Không có lời mời này.');
  notifications.drop(targetId, 'club_invite', actorId);
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
    log(club.id, 'role', actorId, targetId, newRole);
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
 * "Hạng nhóm": clubs ordered by the average rating of their ranked members
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
    SELECT c.id, c.slug, c.name, c.description, c.join_policy, c.color, c.tag, c.avatar_v,
           (SELECT COUNT(*) FROM club_members m WHERE m.club_id = c.id AND m.role != 'pending') AS members,
           ${avgRatingSql()} AS avg_rating
    FROM clubs c ${where}
    ORDER BY members DESC, c.created_at DESC
    LIMIT ? OFFSET ?`).all(category, database.RANKING_MIN_GAMES, ...like, limit, (page - 1) * limit);
  const ranks = clubRanks(category);
  return { total, clubs: rows.map((r) => ({
    slug: r.slug, name: r.name, description: r.description, joinPolicy: r.join_policy, color: r.color, tag: r.tag,
    avatarUrl: imageUrl(r.slug, 'avatar', r.avatar_v),
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

/** Club id if `userId` is its owner/officer, else throws. Used by the tournament flow. */
function staffClubId(userId, slug) {
  const club = getClub(slug);
  requireStaff(club, userId);
  return club.id;
}

/**
 * tournamentId → {slug, name} for every club-hosted tournament, one query. The lobby tournament list
 * shows/filters by it (B210); club_id is only in the DB (not on the in-memory tournament) and is NULLed
 * when the club is deleted, so this is the single source of truth.
 */
function tournamentClubs() {
  const map = new Map();
  for (const r of db().prepare('SELECT t.id, c.slug, c.name FROM tournaments t JOIN clubs c ON c.id = t.club_id').all()) {
    map.set(r.id, { slug: r.slug, name: r.name });
  }
  return map;
}

/** The club's tournaments (all statuses — the tournament list is public too), newest first. */
function clubTournaments(clubId) {
  return db().prepare(`
    SELECT t.id, t.name, t.format, t.status, t.created_at, t.started_at,
           (SELECT COUNT(*) FROM tournament_players p WHERE p.tournament_id = t.id AND p.withdrawn = 0) AS players
    FROM tournaments t WHERE t.club_id = ? ORDER BY t.created_at DESC, t.id LIMIT 50`).all(clubId)
    .map((t) => ({ id: t.id, name: t.name, format: t.format, status: t.status, createdAt: t.created_at, startedAt: t.started_at, players: t.players }));
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
  const role = requireMember(club, userId);
  const b = Number.parseInt(before, 10);
  const a = Number.parseInt(after, 10);
  let where = 'm.club_id = ?';
  const args = [club.id];
  let order = 'DESC';
  if (a > 0) { where += ' AND m.id > ?'; args.push(a); order = 'ASC'; } else if (b > 0) { where += ' AND m.id < ?'; args.push(b); }
  const rows = db().prepare(`
    SELECT m.id, m.sender_id, m.body, m.kind, m.meta, m.created_at, u.username, u.display_name, u.avatar_v
    FROM club_messages m JOIN users u ON u.id = m.sender_id
    WHERE ${where} ORDER BY m.id ${order} LIMIT ?`).all(...args, CHAT_PAGE);
  if (order === 'DESC') rows.reverse();
  const polls = pollStates(club.id, userId, isStaff(role), rows.filter((r) => r.kind === 'poll').map((r) => r.id));
  return rows.map((r) => {
    const out = {
      id: r.id, kind: r.kind, text: r.body, createdAt: r.created_at, mine: r.sender_id === userId,
      username: r.username, displayName: r.display_name, avatarUrl: avatarOf(r.sender_id, r.avatar_v),
    };
    if (r.meta) { try { out.meta = JSON.parse(r.meta); } catch (_) { /* corrupt meta: show the row bare */ } }
    if (polls.has(r.id)) out.poll = polls.get(r.id);
    return out;
  });
}

// --- polls (B449). Closed = closed_at set, or 24 h passed (lazy: no timer). Counts are computed here, per viewer. ---
const pollClosed = (p) => !!p.closed_at || Date.now() >= Date.parse(p.closes_at);

/** message id → { options, counts, total, myOption, closesAt, closed, canClose } for this club's polls among `ids`. */
function pollStates(clubId, viewerId, staff, ids) {
  const out = new Map();
  if (!ids.length) return out;
  const q = ids.map(() => '?').join(',');
  const polls = db().prepare(`SELECT p.* FROM club_polls p JOIN club_messages m ON m.id = p.message_id
    WHERE m.club_id = ? AND p.message_id IN (${q})`).all(clubId, ...ids);
  if (!polls.length) return out;
  const counts = db().prepare(`SELECT message_id, option, COUNT(*) AS n FROM club_poll_votes
    WHERE message_id IN (${q}) GROUP BY message_id, option`).all(...ids);
  const mine = new Map(db().prepare(`SELECT message_id, option FROM club_poll_votes WHERE user_id = ? AND message_id IN (${q})`)
    .all(viewerId, ...ids).map((v) => [v.message_id, v.option]));
  for (const p of polls) {
    const options = JSON.parse(p.options);
    const c = options.map(() => 0);
    for (const row of counts) if (row.message_id === p.message_id && row.option < c.length) c[row.option] = row.n;
    out.set(p.message_id, {
      options, counts: c, total: c.reduce((a, b) => a + b, 0),
      myOption: mine.has(p.message_id) ? mine.get(p.message_id) : null,
      closesAt: p.closed_at || p.closes_at, closed: pollClosed(p),
      canClose: !pollClosed(p) && (staff || p.creator_id === viewerId),
    });
  }
  return out;
}

/** Fresh state of open poll cards on screen (`ids` = "1,2,3" from the chat tick), at most POLL_REFRESH_MAX. */
function refreshPolls(userId, slug, ids) {
  const club = getClub(slug);
  const role = requireMember(club, userId);
  const list = [...new Set(String(ids || '').split(',').map((x) => Number.parseInt(x, 10)).filter((n) => n > 0))].slice(0, POLL_REFRESH_MAX);
  return Object.fromEntries(pollStates(club.id, userId, isStaff(role), list));
}

/** Member + poll of this club, or throws. */
function pollFor(userId, slug, messageId) {
  const club = getClub(slug);
  const role = requireMember(club, userId);
  const id = Number.parseInt(messageId, 10) || 0;
  const poll = db().prepare(`SELECT p.* FROM club_polls p JOIN club_messages m ON m.id = p.message_id
    WHERE m.club_id = ? AND p.message_id = ?`).get(club.id, id);
  if (!poll) throw new ClubError('CLUB_POLL_NOT_FOUND', 404, 'Không tìm thấy bình chọn.');
  return { club, role, poll, id };
}

const pollState = (club, userId, role, id) => pollStates(club.id, userId, isStaff(role), [id]).get(id);

/** Vote for option `option` (0-based), or `null` to take the vote back. One vote per member; changing replaces it. */
function votePoll(userId, slug, messageId, option) {
  const { club, role, poll, id } = pollFor(userId, slug, messageId);
  if (pollClosed(poll)) throw new ClubError('CLUB_POLL_CLOSED', 409, 'Bình chọn đã đóng.');
  if (option === null) {
    db().prepare('DELETE FROM club_poll_votes WHERE message_id = ? AND user_id = ?').run(id, userId);
  } else {
    if (!Number.isInteger(option) || option < 0 || option >= JSON.parse(poll.options).length) {
      throw new ClubError('CLUB_POLL_BAD_OPTION', 400, 'Lựa chọn không hợp lệ.');
    }
    db().prepare(`INSERT INTO club_poll_votes (message_id, user_id, option, voted_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (message_id, user_id) DO UPDATE SET option = excluded.option, voted_at = excluded.voted_at`).run(id, userId, option, now());
  }
  return pollState(club, userId, role, id);
}

/** Creator or staff close a poll early. Closing a closed poll is a no-op. */
function closePoll(userId, slug, messageId) {
  const { club, role, poll, id } = pollFor(userId, slug, messageId);
  if (poll.creator_id !== userId && !isStaff(role)) throw new ClubError('CLUB_FORBIDDEN', 403, 'Chỉ người tạo hoặc ban quản trị đóng được bình chọn.');
  if (!pollClosed(poll)) db().prepare('UPDATE club_polls SET closed_at = ? WHERE message_id = ?').run(now(), id);
  return pollState(club, userId, role, id);
}

/** Named votes (decided 2026-11-24): who picked each option, oldest vote first. Members only, on demand. */
function pollVoters(userId, slug, messageId) {
  const { poll, id } = pollFor(userId, slug, messageId);
  const options = JSON.parse(poll.options).map(() => []);
  for (const v of db().prepare(`SELECT v.option, v.user_id, u.username, u.display_name, u.avatar_v FROM club_poll_votes v
    JOIN users u ON u.id = v.user_id WHERE v.message_id = ? ORDER BY v.voted_at, v.user_id`).all(id)) {
    if (options[v.option]) options[v.option].push({ username: v.username, displayName: v.display_name, avatarUrl: avatarOf(v.user_id, v.avatar_v) });
  }
  return options;
}

/** Insert one chat row and trim the club to the newest CHAT_KEEP. Call inside a transaction. */
function insertMessage(clubId, userId, body, kind = 'text', meta = null) {
  const { lastInsertRowid } = db().prepare('INSERT INTO club_messages (club_id, sender_id, body, kind, meta, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(clubId, userId, body, kind, meta ? JSON.stringify(meta) : null, now());
  db().prepare(`DELETE FROM club_messages WHERE club_id = ? AND id <= (
    SELECT id FROM club_messages WHERE club_id = ? ORDER BY id DESC LIMIT 1 OFFSET ?)`).run(clubId, clubId, CHAT_KEEP);
  return Number(lastInsertRowid);
}

// clubId + ':all' | ':pin' → ms of the last whole-club fan-out (in memory: a restart only re-opens the window).
const lastFanOut = new Map();
const coolingDown = (key) => lastFanOut.has(key) && Date.now() - lastFanOut.get(key) < NOTIFY_COOLDOWN_MS;

/** Confirmed members' ids, optionally only those whose lower-cased username is in `names`; never `exceptId`. */
function memberIds(clubId, exceptId, names) {
  const byName = names ? ` AND lower(u.username) IN (${names.map(() => '?').join(',')})` : '';
  return db().prepare(`SELECT m.user_id FROM club_members m JOIN users u ON u.id = m.user_id
    WHERE m.club_id = ? AND m.role != 'pending' AND m.user_id != ?${byName}`).all(clubId, exceptId, ...(names || []))
    .map((r) => r.user_id);
}

function notifyMany(userIds, type, actorId, payload) {
  if (!userIds.length) return;
  db().transaction(() => { for (const id of userIds) notifications.push(id, type, actorId, payload); })();
}

function senderPayload(club, userId, messageId) {
  const me = database.getUserById(userId);
  return { from: { username: me.username, displayName: me.display_name }, club: { slug: club.slug, name: club.name }, messageId };
}

const rateLimit = (userId) => {
  if (dmText.isRateLimited(userId)) throw new ClubError('CLUB_CHAT_RATE_LIMITED', 429, 'Bạn nhắn quá nhanh.');
};

/**
 * Members only. Plain text, or a slash command (B447) the club's staff left enabled:
 *   /ghim <text>            staff: set the pinned announcement (+ notify all when notifyPin)
 *   /giaohuu @name [rule] [time]  unrated challenge to a confirmed member via ChallengeService
 *   /binhchon q | a | b     any member: a poll card (B449); + notify all when notifyPoll
 * Plain text: @username notifies that member (notifyMention); @all / @tatca from staff notifies the
 * whole club (notifyAll, once per NOTIFY_COOLDOWN_MS). Unknown or disabled commands are refused.
 */
function postMessage(userId, slug, text) {
  const club = getClub(slug);
  const role = requireMember(club, userId);
  const raw = typeof text === 'string' ? text : '';
  const settings = chat.readSettings(club.chat_settings);
  const cmd = chat.parseCommand(raw);
  if (cmd) {
    if (!cmd.kind) throw new ClubError('CLUB_COMMAND_UNKNOWN', 400, `Không có lệnh /${cmd.word}.`);
    if (!settings[chat.COMMAND_TOGGLE[cmd.kind]]) throw new ClubError('CLUB_COMMAND_DISABLED', 403, `Lệnh /${cmd.word} đang tắt trong nhóm này.`);
    if (cmd.kind === 'pin') return pinCommand(club, role, userId, cmd.arg, settings);
    if (cmd.kind === 'poll') return pollCommand(club, role, userId, cmd.arg, settings);
    return challengeCommand(club, userId, cmd.arg);
  }
  const body = dmText.clean(raw);
  if (!body) throw new ClubError('CLUB_MESSAGE_EMPTY', 400, 'Tin nhắn trống.');
  const mentions = chat.parseMentions(raw);
  const toAll = mentions.all && isStaff(role) && settings.notifyAll;
  if (toAll && coolingDown(club.id + ':all')) throw new ClubError('CLUB_NOTIFY_COOLDOWN', 429, 'Chỉ báo cả nhóm 1 lần mỗi 10 phút.');
  rateLimit(userId);
  const id = db().transaction(() => insertMessage(club.id, userId, body))();
  if (toAll) {
    lastFanOut.set(club.id + ':all', Date.now());
    notifyMany(memberIds(club.id, userId), 'club_all', userId, senderPayload(club, userId, id));
  } else if (settings.notifyMention && mentions.usernames.length) {
    notifyMany(memberIds(club.id, userId, mentions.usernames), 'club_mention', userId, senderPayload(club, userId, id));
  }
  return { id };
}

function pinCommand(club, role, userId, arg, settings) {
  if (!isStaff(role)) throw new ClubError('CLUB_FORBIDDEN', 403, 'Chỉ ban quản trị ghim được thông báo.');
  const body = dmText.clean(arg);
  if (!body) throw new ClubError('CLUB_MESSAGE_EMPTY', 400, 'Tin nhắn trống.');
  const { announcement } = validateIdentity({ announcement: arg }); // stored raw like the settings form; ≤ DESC_MAX
  rateLimit(userId);
  const id = db().transaction(() => {
    db().prepare('UPDATE clubs SET announcement = ? WHERE id = ?').run(announcement, club.id);
    return insertMessage(club.id, userId, body, 'pin');
  })();
  // A re-pin within the window (typo fix) updates the pin but does not ping everyone again.
  if (settings.notifyPin && !coolingDown(club.id + ':pin')) {
    lastFanOut.set(club.id + ':pin', Date.now());
    notifyMany(memberIds(club.id, userId), 'club_pin', userId, senderPayload(club, userId, id));
  }
  return { id, kind: 'pin', announcement };
}

function challengeCommand(club, userId, arg) {
  const usage = () => new ClubError('CLUB_COMMAND_INVALID', 400, 'Cú pháp: /giaohuu @tên [luật] [thời gian].');
  const parsed = chat.parseChallengeArg(arg);
  if (!parsed) throw usage();
  const opts = { ...CHALLENGE_DEFAULTS };
  for (const x of parsed.extras) {
    if (WINNING_RULES.includes(x.toLowerCase())) opts.rule = x.toLowerCase();
    else if (PRESETS[x]) opts.time = x;
    else throw usage();
  }
  const target = db().prepare(`SELECT u.id, u.username, u.display_name FROM club_members m JOIN users u ON u.id = m.user_id
    WHERE m.club_id = ? AND m.role != 'pending' AND lower(u.username) = ?`).get(club.id, parsed.username.toLowerCase());
  if (!target) throw new ClubError('CLUB_NOT_MEMBER', 404, 'Người này không phải thành viên.');
  rateLimit(userId);
  // Lazy: ChallengeService pulls in the room stack; club reads and tests never need it.
  const challenges = require('./ChallengeService');
  let sent;
  try {
    sent = challenges.send(userId, target.username, { rule: opts.rule, time: opts.time, rated: false });
  } catch (err) {
    if (err instanceof challenges.ChallengeError) throw new ClubError(err.code, err.status, err.message);
    throw err;
  }
  const meta = { to: { username: target.username, displayName: target.display_name }, rule: opts.rule, time: opts.time };
  const id = db().transaction(() => insertMessage(club.id, userId, '', 'challenge', meta))();
  return { id, kind: 'challenge', challengeId: sent.id };
}

function pollCommand(club, role, userId, arg, settings) {
  const parsed = chat.parsePollArg(arg);
  if (parsed.error) throw new ClubError('CLUB_POLL_INVALID', 400, POLL_ERRORS[parsed.error]);
  const open = db().prepare(`SELECT COUNT(*) AS n FROM club_polls p JOIN club_messages m ON m.id = p.message_id
    WHERE m.club_id = ? AND p.creator_id = ? AND p.closed_at IS NULL AND p.closes_at > ?`).get(club.id, userId, now()).n;
  if (open >= MAX_OPEN_POLLS) throw new ClubError('CLUB_POLL_LIMIT', 409, `Bạn đang có ${MAX_OPEN_POLLS} bình chọn chưa đóng.`);
  rateLimit(userId);
  const options = parsed.options.map((o) => dmText.clean(o));
  const id = db().transaction(() => {
    const mid = insertMessage(club.id, userId, dmText.clean(parsed.question), 'poll');
    db().prepare('INSERT INTO club_polls (message_id, creator_id, options, closes_at) VALUES (?, ?, ?, ?)')
      .run(mid, userId, JSON.stringify(options), new Date(Date.now() + POLL_OPEN_MS).toISOString());
    return mid;
  })();
  if (settings.notifyPoll && !coolingDown(club.id + ':poll')) {
    lastFanOut.set(club.id + ':poll', Date.now());
    notifyMany(memberIds(club.id, userId), 'club_poll', userId, senderPayload(club, userId, id));
  }
  return { id, kind: 'poll', poll: pollState(club, userId, role, id) };
}

/** Test seam: forget the whole-club fan-out windows. */
const _resetFanOut = () => lastFanOut.clear();

function deleteMessage(userId, slug, messageId) {
  const club = getClub(slug);
  requireStaff(club, userId);
  const r = db().prepare('DELETE FROM club_messages WHERE id = ? AND club_id = ?').run(Number.parseInt(messageId, 10) || 0, club.id);
  if (!r.changes) throw new ClubError('CLUB_MESSAGE_NOT_FOUND', 404, 'Không tìm thấy tin nhắn.');
}

/** Wins in the last 7 days among confirmed members (#235). Any finished game counts, rated or not. */
function weeklyBoard(clubId) {
  const since = new Date(Date.now() - WEEK_MS).toISOString();
  return db().prepare(`
    WITH g AS (
      SELECT black_player_id AS uid, CASE WHEN winner_color = 'BLACK' THEN 1 ELSE 0 END AS win FROM games
        WHERE black_player_id IS NOT NULL AND ended_at >= @since AND winner_color IS NOT NULL
      UNION ALL
      SELECT white_player_id, CASE WHEN winner_color = 'WHITE' THEN 1 ELSE 0 END FROM games
        WHERE white_player_id IS NOT NULL AND ended_at >= @since AND winner_color IS NOT NULL)
    SELECT m.user_id, u.username, u.display_name, u.avatar_v, SUM(g.win) AS wins, COUNT(*) AS played
    FROM club_members m JOIN users u ON u.id = m.user_id JOIN g ON g.uid = m.user_id
    WHERE m.club_id = @club AND m.role != 'pending'
    GROUP BY m.user_id HAVING wins > 0
    ORDER BY wins DESC, played ASC, u.username LIMIT @lim`)
    .all({ since, club: clubId, lim: WEEKLY_SHOWN })
    .map((r, i) => ({ rank: i + 1, username: r.username, displayName: r.display_name, avatarUrl: avatarOf(r.user_id, r.avatar_v), wins: r.wins, played: r.played }));
}

function clubHistory(clubId) {
  return db().prepare(`
    SELECT l.id, l.type, l.detail, l.created_at, a.username AS a_user, a.display_name AS a_name, t.username AS t_user, t.display_name AS t_name
    FROM club_log l LEFT JOIN users a ON a.id = l.actor_id LEFT JOIN users t ON t.id = l.target_id
    WHERE l.club_id = ? ORDER BY l.id DESC LIMIT ?`).all(clubId, HISTORY_SHOWN)
    .map((r) => ({
      id: r.id, type: r.type, detail: r.detail, at: r.created_at,
      actor: r.a_user ? { username: r.a_user, displayName: r.a_name } : null,
      target: r.t_user ? { username: r.t_user, displayName: r.t_name } : null,
    }));
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
    color: club.color, tag: club.tag, announcement: club.announcement,
    avatarUrl: imageUrl(club.slug, 'avatar', club.avatar_v), bannerUrl: imageUrl(club.slug, 'banner', club.banner_v),
    weekly: weeklyBoard(club.id),
    invited: !!viewerId && !!db().prepare('SELECT 1 FROM club_invites WHERE club_id = ? AND user_id = ?').get(club.id, viewerId),
    members: rows.length,
    rank: clubRanks(category).get(club.id) || null,
    avgRating: avgRows.length ? Math.round(avgRows.reduce((s, r) => s + r.rating, 0) / avgRows.length) : null,
    myRole,
    chat: chat.readSettings(club.chat_settings),
    events: upcomingEvents(club.id),
    tournaments: clubTournaments(club.id),
    leaderboard: rows.map((r, i) => ({
      rank: i + 1, username: r.username, displayName: r.display_name, role: r.role, mine: r.user_id === viewerId,
      avatarUrl: r.avatar_v ? `/api/profile/avatar/${r.user_id}.webp?v=${r.avatar_v}` : null,
      rating: r.rating == null ? null : Math.round(r.rating), games: r.games || 0,
    })),
  };
  if (myRole && myRole !== 'pending') {
    // Unread-dot baseline (B447): newest message someone else sent (my own never count as unread).
    const last = db().prepare('SELECT MAX(id) AS id FROM club_messages WHERE club_id = ? AND sender_id != ?').get(club.id, viewerId);
    body.lastMessageId = (last && last.id) || 0;
  }
  if (isStaff(myRole)) {
    body.pending = db().prepare(`
      SELECT u.username, u.display_name FROM club_members m JOIN users u ON u.id = m.user_id
      WHERE m.club_id = ? AND m.role = 'pending' ORDER BY m.joined_at`).all(club.id)
      .map((p) => ({ username: p.username, displayName: p.display_name }));
    body.invites = db().prepare(`
      SELECT u.username, u.display_name FROM club_invites i JOIN users u ON u.id = i.user_id
      WHERE i.club_id = ? ORDER BY i.created_at`).all(club.id)
      .map((p) => ({ username: p.username, displayName: p.display_name }));
    body.history = clubHistory(club.id);
  }
  return body;
}

function clubsOfUser(userId) {
  return db().prepare(`
    SELECT c.slug, c.name, c.color, c.tag, c.avatar_v, m.role,
           (SELECT COUNT(*) FROM club_members x WHERE x.club_id = c.id AND x.role != 'pending') AS members
    FROM club_members m JOIN clubs c ON c.id = m.club_id
    WHERE m.user_id = ? AND m.role != 'pending' ORDER BY m.joined_at`).all(userId)
    .map((r) => ({ slug: r.slug, name: r.name, color: r.color, tag: r.tag, role: r.role, members: r.members, avatarUrl: imageUrl(r.slug, 'avatar', r.avatar_v) }));
}

function userIdByUsername(username) {
  const u = database.getProfileByUsername(String(username).slice(0, 40));
  return u ? u.id : null;
}

module.exports = {
  ClubError, MAX_MEMBERS, MAX_CLUBS_PER_USER, slugify, log, LOG_KEEP,
  COLORS, createClub, updateClub, deleteClub, join, leave, approve, remove, setRole, invite, revokeInvite,
  createEvent, deleteEvent, staffClubId, tournamentClubs, listMessages, postMessage, deleteMessage, _resetFanOut,
  refreshPolls, votePoll, closePoll, pollVoters, MAX_OPEN_POLLS,
  clubForImageEdit, setImageVersion, getClub, listClubs, getClubDetail, clubsOfUser, userIdByUsername,
};
