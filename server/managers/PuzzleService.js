'use strict';

/**
 * PuzzleService — member-submitted puzzles, admin review, solving (TODO.md #203, features/learn).
 *
 * Board sizes: 15, 17, 19, 20 (the sizes games use). Answer count and length are not capped (user
 * decision 2026-10-10); an answer's moves are distinct empty cells, so it is bounded by the board.
 *
 * An answer is the SOLVER's moves only (the opponent's replies are never entered), so submit-time
 * validation is structural. PuzzleVerifier replays forcing lines (#331): the review queue shows each
 * line's verdict as a hint (never a reject), and a solver line that is not stored still solves the
 * puzzle when it is a verified forced win. Any one matching answer solves the puzzle; `final_move`
 * puzzles take a single decisive move. Answers are never sent to solvers — comparison happens here.
 *
 * Methods throw PuzzleError(code, status); routes translate it to JSON.
 */

const crypto = require('crypto');
const database = require('../db/database');
const roles = require('../utils/roles');
const dmText = require('./DmText');
const coords = require('../../client/js/coords');
const { verifyAnswers } = require('./PuzzleVerifier');

const RULES = ['freestyle', 'standard', 'caro'];
const LEVELS = ['easy', 'medium', 'hard', 'expert'];
const TAGS = ['attack', 'defense', 'trap', 'vct', 'vcf'];
const MODES = ['sequence', 'final_move'];
const BOARD_SIZES = [15, 17, 19, 20];
const DEFAULT_BOARD_SIZE = 15;
const MAX_TAGS = 3;
const MAX_PENDING_PER_USER = 5;
const TITLE_MAX = 60;
const PROMPT_MAX = 280;
const NOTE_MAX = 200;
const PAGE = 20;
/** Rename log rows kept per puzzle (#337). */
const RENAME_KEEP = 50;
/** Wrong-or-right tries a member gets per puzzle, never reset (#335); a solved puzzle is exempt. */
const MAX_ATTEMPTS = 3;
const SOLVERS_MAX = 100;
/** A member's puzzle level = the highest level at which they have solved at least this many (planning: N = 10). */
const LEVEL_THRESHOLD = 10;

const db = () => database.db;

class PuzzleError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'PuzzleError';
    this.code = code;
    this.status = status;
  }
}
const bad = (code, message) => new PuzzleError(code, 400, message);

/** May review puzzles (moderator or admin, R8). */
const isAdmin = (userId) => roles.can(userId, 'puzzle.review');

/** A cell given as {x,y} or as text ("H8", "122") → {x,y} on a size×size board, else null. */
function toCell(c, size) {
  if (typeof c === 'string') return coords.parse(c, size);
  if (c && Number.isInteger(c.x) && Number.isInteger(c.y) && c.x >= 0 && c.y >= 0 && c.x < size && c.y < size) {
    return { x: c.x, y: c.y };
  }
  return null;
}

/** True when `color` already has five in a row somewhere — such a position is not a puzzle. */
function hasFive(grid, color, size) {
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (grid[y][x] !== color) continue;
      for (const [dx, dy] of dirs) {
        let n = 1;
        while (n < 5 && grid[y + dy * n]?.[x + dx * n] === color) n++;
        if (n >= 5) return true;
      }
    }
  }
  return false;
}

function validateStones(raw, toMove, size) {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > size * size) {
    throw bad('PUZZLE_STONES_INVALID', 'Thế cờ cần ít nhất 2 quân.');
  }
  const grid = Array.from({ length: size }, () => Array(size).fill(null));
  const stones = [];
  for (const s of raw) {
    const c = s && toCell(s, size);
    if (!c || (s.color !== 'BLACK' && s.color !== 'WHITE') || grid[c.y][c.x]) {
      throw bad('PUZZLE_STONES_INVALID', 'Quân cờ không hợp lệ hoặc bị trùng ô.');
    }
    grid[c.y][c.x] = s.color;
    stones.push({ x: c.x, y: c.y, color: s.color });
  }
  const diff = stones.filter((s) => s.color === 'BLACK').length - stones.filter((s) => s.color === 'WHITE').length;
  if (diff !== (toMove === 'BLACK' ? 0 : 1)) {
    throw bad('PUZZLE_STONES_INVALID', 'Số quân đen/trắng không khớp với bên đến lượt.');
  }
  if (hasFive(grid, 'BLACK', size) || hasFive(grid, 'WHITE', size)) {
    throw bad('PUZZLE_STONES_INVALID', 'Thế cờ đã có năm quân liền.');
  }
  stones.sort((a, b) => a.y - b.y || a.x - b.x);
  return { stones, grid };
}

const MAX_PORTAL_PAIRS = 8;

/** Walls [{x,y}] and portal pairs [{a,b}] on empty cells; marks `grid` so answers cannot land on them. */
function validateLayout(raw, grid, size) {
  const bad_ = () => bad('PUZZLE_STONES_INVALID', 'Tường/cổng không hợp lệ hoặc bị trùng ô.');
  const r = raw === undefined || raw === null ? {} : raw;
  if (typeof r !== 'object' || Array.isArray(r)) throw bad_();
  const wallsIn = r.walls === undefined ? [] : r.walls;
  const portalsIn = r.portals === undefined ? [] : r.portals;
  if (!Array.isArray(wallsIn) || !Array.isArray(portalsIn) || wallsIn.length > size * size / 4 || portalsIn.length > MAX_PORTAL_PAIRS) throw bad_();
  const take = (c, mark) => {
    const cell = c && toCell(c, size);
    if (!cell || grid[cell.y][cell.x]) throw bad_();
    grid[cell.y][cell.x] = mark;
    return cell;
  };
  const walls = wallsIn.map((c) => take(c, 'WALL'));
  const portals = portalsIn.map((p) => {
    if (!p || typeof p !== 'object') throw bad_();
    return { a: take(p.a, 'PORTAL'), b: take(p.b, 'PORTAL') };
  });
  return { walls, portals };
}

function validateAnswers(raw, mode, grid, size) {
  if (!Array.isArray(raw) || raw.length < 1) {
    throw bad('PUZZLE_ANSWER_INVALID', 'Cần ít nhất một đáp án.');
  }
  return raw.map((a) => {
    const list = Array.isArray(a) ? a.map((c) => toCell(c, size)) : null;
    if (!list || !list.length || list.some((c) => !c)) {
      throw bad('PUZZLE_ANSWER_INVALID', 'Đáp án có tọa độ không hợp lệ.');
    }
    if (mode === 'final_move' && list.length !== 1) {
      throw bad('PUZZLE_ANSWER_INVALID', 'Chế độ nước cuối chỉ nhận một nước.');
    }
    const seen = new Set();
    for (const c of list) {
      const k = `${c.x},${c.y}`;
      if (grid[c.y][c.x] || seen.has(k)) throw bad('PUZZLE_ANSWER_INVALID', 'Đáp án đi vào ô đã có quân hoặc lặp ô.');
      seen.add(k);
    }
    return list;
  });
}

function cleanTitle(raw) {
  const title = dmText.clean(typeof raw === 'string' ? raw : '');
  if (!title || title.length > TITLE_MAX) throw bad('PUZZLE_TITLE_INVALID', `Tiêu đề dài 1–${TITLE_MAX} ký tự.`);
  return title;
}

/** Validate + normalise author input. @returns the row fields (minus ids/status/timestamps). */
function normalise(input) {
  const i = input || {};
  const title = cleanTitle(i.title);
  const prompt = dmText.clean(typeof i.prompt === 'string' ? i.prompt : '');
  if (prompt.length > PROMPT_MAX) throw bad('PUZZLE_PROMPT_INVALID', `Đề bài tối đa ${PROMPT_MAX} ký tự.`);
  if (!RULES.includes(i.rule)) throw bad('PUZZLE_RULE_INVALID', 'Luật không hợp lệ.');
  const size = i.boardSize === undefined ? DEFAULT_BOARD_SIZE : i.boardSize;
  if (!BOARD_SIZES.includes(size)) throw bad('PUZZLE_RULE_INVALID', 'Cỡ bàn không hợp lệ.');
  if (i.toMove !== 'BLACK' && i.toMove !== 'WHITE') throw bad('PUZZLE_STONES_INVALID', 'Bên đến lượt không hợp lệ.');
  if (!MODES.includes(i.mode)) throw bad('PUZZLE_ANSWER_INVALID', 'Chế độ đáp án không hợp lệ.');
  if (!LEVELS.includes(i.level)) throw bad('PUZZLE_LEVEL_INVALID', 'Level không hợp lệ.');
  const tags = Array.isArray(i.tags) ? [...new Set(i.tags)] : [];
  if (!tags.length || tags.length > MAX_TAGS || tags.some((t) => !TAGS.includes(t))) {
    throw bad('PUZZLE_TAGS_INVALID', `Chọn 1–${MAX_TAGS} tag hợp lệ.`);
  }
  const { stones, grid } = validateStones(i.stones, i.toMove, size);
  const layout = validateLayout(i.layout, grid, size);
  const answers = validateAnswers(i.answers, i.mode, grid, size);
  const hash = crypto.createHash('sha1')
    .update(JSON.stringify(layout.walls.length || layout.portals.length ? [i.rule, size, i.toMove, stones, layout] : [i.rule, size, i.toMove, stones])).digest('hex');
  return { title, prompt, rule: i.rule, size, toMove: i.toMove, mode: i.mode, level: i.level, tags, stones, layout, answers, hash };
}

const countPending = (userId, exceptId) => db().prepare(
  "SELECT COUNT(*) AS n FROM puzzles WHERE author_id = ? AND status = 'pending' AND id != ?").get(userId, exceptId || '').n;

function writeTags(id, tags) {
  db().prepare('DELETE FROM puzzle_tags WHERE puzzle_id = ?').run(id);
  const ins = db().prepare('INSERT INTO puzzle_tags (puzzle_id, tag) VALUES (?, ?)');
  for (const t of tags) ins.run(id, t);
}

function createPuzzle(userId, input) {
  const p = normalise(input);
  return db().transaction(() => {
    if (countPending(userId) >= MAX_PENDING_PER_USER) {
      throw new PuzzleError('PUZZLE_PENDING_LIMIT', 409, `Tối đa ${MAX_PENDING_PER_USER} puzzle đang chờ duyệt.`);
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const number = db().prepare('SELECT COALESCE(MAX(number), 0) + 1 AS n FROM puzzles').get().n; // never reused: puzzles are not deleted (#333)
    db().prepare(`INSERT INTO puzzles (id, number, author_id, title, prompt, rule, board_size, stones, layout, to_move, mode, answers, level, position_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, number, userId, p.title, p.prompt, p.rule, p.size, JSON.stringify(p.stones), JSON.stringify(p.layout), p.toMove, p.mode, JSON.stringify(p.answers), p.level, p.hash, now, now);
    writeTags(id, p.tags);
    return { id, status: 'pending' };
  })();
}

/** What decides whether a stored solve is still right: everything but title/prompt/tags/level (#332). */
const positionKey = (rule, size, toMove, mode, stones, walls, portals, answers) =>
  JSON.stringify([rule, size, toMove, mode, stones, walls, portals, answers]);

/**
 * Author edits; a changed approved/rejected puzzle goes back to pending. Solves and attempts are cleared only
 * when the position, layout or answers changed (#332) — a title/prompt/tag/level edit keeps them.
 */
function updatePuzzle(userId, id, input) {
  const p = normalise(input);
  return db().transaction(() => {
    const row = db().prepare('SELECT * FROM puzzles WHERE id = ?').get(String(id).slice(0, 64));
    if (!row) throw new PuzzleError('PUZZLE_NOT_FOUND', 404, 'Không tìm thấy puzzle.');
    if (row.author_id !== userId) throw new PuzzleError('PUZZLE_FORBIDDEN', 403, 'Bạn không có quyền.');
    if (row.status !== 'pending' && countPending(userId, id) >= MAX_PENDING_PER_USER) {
      throw new PuzzleError('PUZZLE_PENDING_LIMIT', 409, `Tối đa ${MAX_PENDING_PER_USER} puzzle đang chờ duyệt.`);
    }
    db().prepare(`UPDATE puzzles SET title = ?, prompt = ?, rule = ?, board_size = ?, stones = ?, layout = ?, to_move = ?, mode = ?, answers = ?, level = ?,
      position_hash = ?, status = 'pending', review_note = '', reviewed_at = NULL, reviewed_by = NULL, updated_at = ? WHERE id = ?`)
      .run(p.title, p.prompt, p.rule, p.size, JSON.stringify(p.stones), JSON.stringify(p.layout), p.toMove, p.mode, JSON.stringify(p.answers), p.level, p.hash, new Date().toISOString(), row.id);
    writeTags(row.id, p.tags);
    const lay = layoutOf(row);
    const changed = positionKey(row.rule, row.board_size, row.to_move, row.mode, JSON.parse(row.stones), lay.walls, lay.portals, JSON.parse(row.answers))
      !== positionKey(p.rule, p.size, p.toMove, p.mode, p.stones, p.layout.walls, p.layout.portals, p.answers);
    if (row.status === 'approved' && changed) {
      db().prepare('DELETE FROM puzzle_progress WHERE puzzle_id = ?').run(row.id);
      db().prepare('DELETE FROM puzzle_attempts WHERE puzzle_id = ?').run(row.id);
    }
    return { id: row.id, status: 'pending' };
  })();
}

/** Title-only rename by the author (or a reviewer): keeps status, solves and attempts (#334); logged for reviewers (#337). */
function renamePuzzle(userId, id, rawTitle) {
  const title = cleanTitle(rawTitle);
  return db().transaction(() => {
    const row = db().prepare('SELECT id, author_id, title FROM puzzles WHERE id = ?').get(String(id).slice(0, 64));
    if (!row) throw new PuzzleError('PUZZLE_NOT_FOUND', 404, 'Không tìm thấy puzzle.');
    if (row.author_id !== userId && !isAdmin(userId)) throw new PuzzleError('PUZZLE_FORBIDDEN', 403, 'Bạn không có quyền.');
    const now = new Date().toISOString();
    db().prepare('UPDATE puzzles SET title = ?, updated_at = ? WHERE id = ?').run(title, now, row.id);
    if (title !== row.title) {
      db().prepare('INSERT INTO puzzle_renames (puzzle_id, user_id, old_title, new_title, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(row.id, userId, row.title, title, now);
      db().prepare(`DELETE FROM puzzle_renames WHERE puzzle_id = ? AND id NOT IN
        (SELECT id FROM puzzle_renames WHERE puzzle_id = ? ORDER BY id DESC LIMIT ?)`).run(row.id, row.id, RENAME_KEEP);
    }
    return { id: row.id, title };
  })();
}

/** Recent title changes, newest first, for reviewers (#337). */
function renameLog(adminId, { page } = {}) {
  requireAdmin(adminId);
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const total = db().prepare('SELECT COUNT(*) AS n FROM puzzle_renames').get().n;
  const rows = db().prepare(`SELECT r.id, r.puzzle_id, r.old_title, r.new_title, r.created_at, p.number, p.status,
      u.username, u.display_name FROM puzzle_renames r JOIN puzzles p ON p.id = r.puzzle_id JOIN users u ON u.id = r.user_id
    ORDER BY r.id DESC LIMIT ? OFFSET ?`).all(PAGE, (pg - 1) * PAGE);
  return {
    renames: rows.map((r) => ({
      id: r.id, puzzleId: r.puzzle_id, number: r.number, status: r.status, oldTitle: r.old_title, newTitle: r.new_title,
      createdAt: r.created_at, by: { username: r.username, displayName: r.display_name },
    })),
    pagination: { page: pg, limit: PAGE, total, totalPages: Math.ceil(total / PAGE) },
  };
}

function tagsOf(ids) {
  const map = new Map(ids.map((i) => [i, []]));
  if (!ids.length) return map;
  const rows = db().prepare(`SELECT puzzle_id, tag FROM puzzle_tags WHERE puzzle_id IN (${ids.map(() => '?').join(',')}) ORDER BY tag`).all(...ids);
  for (const r of rows) map.get(r.puzzle_id).push(r.tag);
  return map;
}

function layoutOf(row) {
  const l = JSON.parse(row.layout || '{}');
  return { walls: l.walls || [], portals: l.portals || [] };
}

function shape(row, tags, { answers = false, solved } = {}) {
  const out = {
    id: row.id, number: row.number, title: row.title, prompt: row.prompt, rule: row.rule, boardSize: row.board_size,
    stones: JSON.parse(row.stones), walls: layoutOf(row).walls, portals: layoutOf(row).portals, toMove: row.to_move, mode: row.mode, level: row.level, status: row.status,
    tags, author: row.author_name ? { username: row.author_username, displayName: row.author_name } : undefined,
    createdAt: row.created_at,
  };
  if (answers) out.answers = JSON.parse(row.answers);
  if (solved !== undefined) out.solved = solved;
  return out;
}

/** PuzzleVerifier verdicts for `answers` (default: the stored lines) on a stored puzzle row. */
function verificationOf(row, answers = JSON.parse(row.answers)) {
  const { walls, portals } = layoutOf(row);
  return verifyAnswers({ size: row.board_size, rule: row.rule, toMove: row.to_move, stones: JSON.parse(row.stones), walls, portals }, answers);
}

const AUTHOR_JOIN = 'SELECT p.*, u.username AS author_username, u.display_name AS author_name FROM puzzles p JOIN users u ON u.id = p.author_id';

/** Approved puzzles, optionally filtered; `solved` is set for a logged-in viewer. */
function listApproved(viewerId, { tag, level, rule, page } = {}) {
  const where = ["p.status = 'approved'"];
  const args = [];
  if (LEVELS.includes(level)) { where.push('p.level = ?'); args.push(level); }
  if (RULES.includes(rule)) { where.push('p.rule = ?'); args.push(rule); }
  if (TAGS.includes(tag)) { where.push('EXISTS (SELECT 1 FROM puzzle_tags t WHERE t.puzzle_id = p.id AND t.tag = ?)'); args.push(tag); }
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const total = db().prepare(`SELECT COUNT(*) AS n FROM puzzles p WHERE ${where.join(' AND ')}`).get(...args).n;
  const rows = db().prepare(`${AUTHOR_JOIN} WHERE ${where.join(' AND ')} ORDER BY p.created_at DESC, p.id LIMIT ? OFFSET ?`)
    .all(...args, PAGE, (pg - 1) * PAGE);
  const tags = tagsOf(rows.map((r) => r.id));
  const solvedSet = new Set(viewerId && rows.length
    ? db().prepare(`SELECT puzzle_id FROM puzzle_progress WHERE user_id = ? AND solved_at IS NOT NULL AND puzzle_id IN (${rows.map(() => '?').join(',')})`)
      .all(viewerId, ...rows.map((r) => r.id)).map((r) => r.puzzle_id)
    : []);
  return {
    puzzles: rows.map((r) => {
      const { stones, ...rest } = shape(r, tags.get(r.id), { solved: viewerId ? solvedSet.has(r.id) : undefined });
      return rest; // the list needs no board
    }),
    pagination: { page: pg, limit: PAGE, total, totalPages: Math.ceil(total / PAGE) },
  };
}

/** A puzzle row (with author) by UUID, or by its #number when the id is all digits (#333). */
function findRow(id) {
  const key = String(id).slice(0, 64);
  return /^\d{1,9}$/.test(key)
    ? db().prepare(`${AUTHOR_JOIN} WHERE p.number = ?`).get(Number(key))
    : db().prepare(`${AUTHOR_JOIN} WHERE p.id = ?`).get(key);
}

/** One puzzle. Not-approved ones are visible to their author and admins only (with answers). */
function getPuzzle(viewerId, id) {
  const row = findRow(id);
  const privileged = !!row && !!viewerId && (row.author_id === viewerId || isAdmin(viewerId));
  if (!row || (row.status !== 'approved' && !privileged)) throw new PuzzleError('PUZZLE_NOT_FOUND', 404, 'Không tìm thấy puzzle.');
  const prog = viewerId ? db().prepare('SELECT solved_at FROM puzzle_progress WHERE user_id = ? AND puzzle_id = ?').get(viewerId, row.id) : null;
  const out = shape(row, tagsOf([row.id]).get(row.id), { answers: privileged, solved: viewerId ? !!(prog && prog.solved_at) : undefined });
  if (viewerId && row.status === 'approved') Object.assign(out, attemptInfo(viewerId, row.id));
  return out;
}

/** Check a solver's moves against the accepted answers. Records an attempt (and the first solve). */
function solve(userId, id, rawMoves) {
  const row = findRow(id);
  if (!row || row.status !== 'approved') throw new PuzzleError('PUZZLE_NOT_FOUND', 404, 'Không tìm thấy puzzle.');
  const size = row.board_size;
  const moves = Array.isArray(rawMoves) && rawMoves.length <= size * size ? rawMoves.map((c) => toCell(c, size)) : null;
  if (!moves || !moves.length || moves.some((c) => !c)) throw bad('PUZZLE_MOVES_INVALID', 'Tọa độ không hợp lệ.');
  const same = (a, b) => a.length === b.length && a.every((c, k) => c.x === b[k].x && c.y === b[k].y);
  // Not a stored line: still solved when it is a forced win ending on its winning move (#331).
  const forcedWin = () => {
    if (row.mode === 'final_move' && moves.length !== 1) return false;
    const v = verificationOf(row, [moves])[0];
    return v.status === 'verified' && v.step === moves.length;
  };
  const prog = db().prepare('SELECT attempts, solved_at FROM puzzle_progress WHERE user_id = ? AND puzzle_id = ?').get(userId, row.id);
  if (!(prog && prog.solved_at) && prog && prog.attempts >= MAX_ATTEMPTS) {
    const e = new PuzzleError('PUZZLE_ATTEMPTS_EXCEEDED', 429, `Bạn đã dùng hết ${MAX_ATTEMPTS} lượt thử cho puzzle này.`);
    e.attemptsLeft = 0;
    throw e;
  }
  const correct = JSON.parse(row.answers).some((a) => same(a, moves)) || forcedWin();
  const now = new Date().toISOString();
  db().transaction(() => {
    db().prepare('INSERT OR IGNORE INTO puzzle_progress (user_id, puzzle_id) VALUES (?, ?)').run(userId, row.id);
    db().prepare('UPDATE puzzle_progress SET attempts = attempts + 1 WHERE user_id = ? AND puzzle_id = ?').run(userId, row.id);
    if (correct) db().prepare('UPDATE puzzle_progress SET solved_at = COALESCE(solved_at, ?) WHERE user_id = ? AND puzzle_id = ?').run(now, userId, row.id);
    db().prepare('INSERT INTO puzzle_attempts (user_id, puzzle_id, moves, correct, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(userId, row.id, JSON.stringify(moves), correct ? 1 : 0, now);
  })();
  return { correct, ...attemptInfo(userId, row.id) };
}

/** {attemptsUsed, attemptsLeft (null once solved: unlimited), maxAttempts} for one member and puzzle. */
function attemptInfo(userId, puzzleId) {
  const g = db().prepare('SELECT attempts, solved_at FROM puzzle_progress WHERE user_id = ? AND puzzle_id = ?').get(userId, puzzleId);
  const used = g ? g.attempts : 0;
  return { attemptsUsed: used, attemptsLeft: g && g.solved_at ? null : Math.max(0, MAX_ATTEMPTS - used), maxAttempts: MAX_ATTEMPTS };
}

/** The member's own tries on an approved puzzle, newest first (#336). Other members' moves are never exposed. */
function myAttempts(userId, id) {
  const row = findRow(id);
  if (!row || row.status !== 'approved') throw new PuzzleError('PUZZLE_NOT_FOUND', 404, 'Không tìm thấy puzzle.');
  const attempts = db().prepare('SELECT moves, correct, created_at FROM puzzle_attempts WHERE user_id = ? AND puzzle_id = ? ORDER BY id DESC')
    .all(userId, row.id).map((a) => ({ moves: JSON.parse(a.moves), correct: !!a.correct, createdAt: a.created_at }));
  return { attempts, ...attemptInfo(userId, row.id) };
}

/**
 * Who solved an approved puzzle and in how many tries (public, #336), earliest first. Tries = the attempts
 * up to the first correct one; solves from before attempts were recorded fall back to the progress counter.
 */
function solvers(id) {
  const row = findRow(id);
  if (!row || row.status !== 'approved') throw new PuzzleError('PUZZLE_NOT_FOUND', 404, 'Không tìm thấy puzzle.');
  const rows = db().prepare(`SELECT u.id, u.username, u.display_name, u.avatar_v, g.solved_at,
      CASE WHEN fc.first_id IS NULL THEN g.attempts
           ELSE (SELECT COUNT(*) FROM puzzle_attempts a WHERE a.user_id = g.user_id AND a.puzzle_id = g.puzzle_id AND a.id <= fc.first_id) END AS tries
    FROM puzzle_progress g JOIN users u ON u.id = g.user_id
    LEFT JOIN (SELECT user_id, puzzle_id, MIN(id) AS first_id FROM puzzle_attempts WHERE correct = 1 GROUP BY user_id, puzzle_id) fc
      ON fc.user_id = g.user_id AND fc.puzzle_id = g.puzzle_id
    WHERE g.puzzle_id = ? AND g.solved_at IS NOT NULL ORDER BY g.solved_at, u.id LIMIT ?`).all(row.id, SOLVERS_MAX);
  const total = db().prepare('SELECT COUNT(*) AS n FROM puzzle_progress WHERE puzzle_id = ? AND solved_at IS NOT NULL').get(row.id).n;
  return {
    total,
    solvers: rows.map((r) => ({
      username: r.username, displayName: r.display_name, tries: r.tries, solvedAt: r.solved_at,
      avatarUrl: r.avatar_v ? `/api/profile/avatar/${r.id}.webp?v=${r.avatar_v}` : null,
    })),
  };
}

/** The author's own puzzles, every status, with the reviewer's note. */
function mine(userId, { page } = {}) {
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const total = db().prepare('SELECT COUNT(*) AS n FROM puzzles WHERE author_id = ?').get(userId).n;
  const rows = db().prepare(`${AUTHOR_JOIN} WHERE p.author_id = ? ORDER BY p.created_at DESC, p.id LIMIT ? OFFSET ?`).all(userId, PAGE, (pg - 1) * PAGE);
  const tags = tagsOf(rows.map((r) => r.id));
  return {
    puzzles: rows.map((r) => ({ ...shape(r, tags.get(r.id), { answers: true }), reviewNote: r.review_note })),
    pagination: { page: pg, limit: PAGE, total, totalPages: Math.ceil(total / PAGE) },
  };
}

function requireAdmin(userId) {
  if (!isAdmin(userId)) throw new PuzzleError('PUZZLE_FORBIDDEN', 403, 'Bạn không có quyền.');
}

/** Pending puzzles, oldest first, each with how many OTHER puzzles share its position and its answers' verdicts (#331). */
function reviewQueue(adminId, { page } = {}) {
  requireAdmin(adminId);
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const total = db().prepare("SELECT COUNT(*) AS n FROM puzzles WHERE status = 'pending'").get().n;
  const rows = db().prepare(`${AUTHOR_JOIN} WHERE p.status = 'pending' ORDER BY p.created_at, p.id LIMIT ? OFFSET ?`).all(PAGE, (pg - 1) * PAGE);
  const tags = tagsOf(rows.map((r) => r.id));
  const dup = db().prepare('SELECT COUNT(*) AS n FROM puzzles WHERE position_hash = ? AND id != ?');
  return {
    puzzles: rows.map((r) => ({ ...shape(r, tags.get(r.id), { answers: true }), duplicates: dup.get(r.position_hash, r.id).n, verification: verificationOf(r) })),
    pagination: { page: pg, limit: PAGE, total, totalPages: Math.ceil(total / PAGE) },
  };
}

function review(adminId, id, { decision, level, note } = {}) {
  requireAdmin(adminId);
  return db().transaction(() => {
    const row = db().prepare('SELECT id, status, author_id FROM puzzles WHERE id = ?').get(String(id).slice(0, 64));
    if (!row) throw new PuzzleError('PUZZLE_NOT_FOUND', 404, 'Không tìm thấy puzzle.');
    if (row.status !== 'pending') throw new PuzzleError('PUZZLE_NOT_PENDING', 409, 'Puzzle này không còn chờ duyệt.');
    if (decision !== 'approve' && decision !== 'reject') throw bad('PUZZLE_DECISION_INVALID', 'Quyết định không hợp lệ.');
    const cleanNote = dmText.clean(typeof note === 'string' ? note : '');
    if (cleanNote.length > NOTE_MAX) throw bad('PUZZLE_DECISION_INVALID', `Ghi chú tối đa ${NOTE_MAX} ký tự.`);
    if (decision === 'reject' && !cleanNote) throw bad('PUZZLE_DECISION_INVALID', 'Từ chối cần ghi chú lý do.');
    if (decision === 'approve' && level !== undefined && !LEVELS.includes(level)) throw bad('PUZZLE_LEVEL_INVALID', 'Level không hợp lệ.');
    const now = new Date().toISOString();
    if (decision === 'approve') {
      db().prepare("UPDATE puzzles SET status = 'approved', level = COALESCE(?, level), review_note = ?, reviewed_at = ?, reviewed_by = ?, updated_at = ? WHERE id = ?")
        .run(level || null, cleanNote, now, adminId, now, row.id);
    } else {
      db().prepare("UPDATE puzzles SET status = 'rejected', review_note = ?, reviewed_at = ?, reviewed_by = ?, updated_at = ? WHERE id = ?")
        .run(cleanNote, now, adminId, now, row.id);
    }
    return { id: row.id, status: decision === 'approve' ? 'approved' : 'rejected' };
  })();
}

/**
 * Public puzzle record for the profile (7b): solved count (approved puzzles only) and level.
 * `level` is the highest LEVELS entry with >= LEVEL_THRESHOLD solved puzzles of exactly that level, else null.
 */
function statsFor(userId) {
  const rows = db().prepare(`SELECT p.level, COUNT(*) AS n FROM puzzle_progress g JOIN puzzles p ON p.id = g.puzzle_id
    WHERE g.user_id = ? AND g.solved_at IS NOT NULL AND p.status = 'approved' GROUP BY p.level`).all(userId);
  const byLevel = Object.fromEntries(LEVELS.map((l) => [l, 0]));
  for (const r of rows) byLevel[r.level] = r.n;
  const level = [...LEVELS].reverse().find((l) => byLevel[l] >= LEVEL_THRESHOLD) || null;
  return { solved: Object.values(byLevel).reduce((a, b) => a + b, 0), level, byLevel, threshold: LEVEL_THRESHOLD };
}

/** Dashboard Learn card (#224): approved puzzle count, and how many of them the member solved (null for guests). */
function learnSummary(userId) {
  const total = db().prepare("SELECT COUNT(*) AS n FROM puzzles WHERE status = 'approved'").get().n;
  if (!userId) return { total, solved: null };
  return { total, solved: statsFor(userId).solved };
}

module.exports = {
  statsFor, learnSummary, LEVEL_THRESHOLD,
  PuzzleError, RULES, LEVELS, TAGS, MODES, BOARD_SIZES, MAX_PENDING_PER_USER, isAdmin,
  MAX_ATTEMPTS, createPuzzle, updatePuzzle, renameLog, renamePuzzle, listApproved, getPuzzle, solve, myAttempts, solvers, mine, reviewQueue, review,
};
