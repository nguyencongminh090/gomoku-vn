'use strict';

/**
 * PuzzleService — member-submitted puzzles, admin review, solving (TODO.md #203, features/learn).
 *
 * Board sizes: 15, 17, 19, 20 (the sizes games use). Answer count and length are not capped (user
 * decision 2026-10-10); an answer's moves are distinct empty cells, so it is bounded by the board.
 *
 * An answer is the SOLVER's moves only (the opponent's replies are never entered), so submit-time
 * validation is structural; whether the line really wins is the reviewer's call. Any one matching
 * answer solves the puzzle; `final_move` puzzles take a single decisive move. Answers are never sent
 * to solvers — comparison happens here.
 *
 * Methods throw PuzzleError(code, status); routes translate it to JSON.
 */

const crypto = require('crypto');
const database = require('../db/database');
const roles = require('../utils/roles');
const dmText = require('./DmText');
const coords = require('../../client/js/coords');

const RULES = ['freestyle', 'standard', 'caro'];
const LEVELS = ['easy', 'medium', 'hard', 'expert'];
const TAGS = ['three', 'four_three', 'vcf', 'vct', 'defense', 'trap'];
const MODES = ['sequence', 'final_move'];
const BOARD_SIZES = [15, 17, 19, 20];
const DEFAULT_BOARD_SIZE = 15;
const MAX_TAGS = 3;
const MAX_PENDING_PER_USER = 5;
const TITLE_MAX = 60;
const PROMPT_MAX = 280;
const NOTE_MAX = 200;
const PAGE = 20;
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

/** Validate + normalise author input. @returns the row fields (minus ids/status/timestamps). */
function normalise(input) {
  const i = input || {};
  const title = dmText.clean(typeof i.title === 'string' ? i.title : '');
  if (!title || title.length > TITLE_MAX) throw bad('PUZZLE_TITLE_INVALID', `Tiêu đề dài 1–${TITLE_MAX} ký tự.`);
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
  const answers = validateAnswers(i.answers, i.mode, grid, size);
  const hash = crypto.createHash('sha1')
    .update(JSON.stringify([i.rule, size, i.toMove, stones])).digest('hex');
  return { title, prompt, rule: i.rule, size, toMove: i.toMove, mode: i.mode, level: i.level, tags, stones, answers, hash };
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
    db().prepare(`INSERT INTO puzzles (id, author_id, title, prompt, rule, board_size, stones, to_move, mode, answers, level, position_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, userId, p.title, p.prompt, p.rule, p.size, JSON.stringify(p.stones), p.toMove, p.mode, JSON.stringify(p.answers), p.level, p.hash, now, now);
    writeTags(id, p.tags);
    return { id, status: 'pending' };
  })();
}

/** Author edits; a changed approved/rejected puzzle goes back to pending and its solves are cleared. */
function updatePuzzle(userId, id, input) {
  const p = normalise(input);
  return db().transaction(() => {
    const row = db().prepare('SELECT * FROM puzzles WHERE id = ?').get(String(id).slice(0, 64));
    if (!row) throw new PuzzleError('PUZZLE_NOT_FOUND', 404, 'Không tìm thấy puzzle.');
    if (row.author_id !== userId) throw new PuzzleError('PUZZLE_FORBIDDEN', 403, 'Bạn không có quyền.');
    if (row.status !== 'pending' && countPending(userId, id) >= MAX_PENDING_PER_USER) {
      throw new PuzzleError('PUZZLE_PENDING_LIMIT', 409, `Tối đa ${MAX_PENDING_PER_USER} puzzle đang chờ duyệt.`);
    }
    db().prepare(`UPDATE puzzles SET title = ?, prompt = ?, rule = ?, board_size = ?, stones = ?, to_move = ?, mode = ?, answers = ?, level = ?,
      position_hash = ?, status = 'pending', review_note = '', reviewed_at = NULL, reviewed_by = NULL, updated_at = ? WHERE id = ?`)
      .run(p.title, p.prompt, p.rule, p.size, JSON.stringify(p.stones), p.toMove, p.mode, JSON.stringify(p.answers), p.level, p.hash, new Date().toISOString(), row.id);
    writeTags(row.id, p.tags);
    if (row.status === 'approved') db().prepare('DELETE FROM puzzle_progress WHERE puzzle_id = ?').run(row.id);
    return { id: row.id, status: 'pending' };
  })();
}

function tagsOf(ids) {
  const map = new Map(ids.map((i) => [i, []]));
  if (!ids.length) return map;
  const rows = db().prepare(`SELECT puzzle_id, tag FROM puzzle_tags WHERE puzzle_id IN (${ids.map(() => '?').join(',')}) ORDER BY tag`).all(...ids);
  for (const r of rows) map.get(r.puzzle_id).push(r.tag);
  return map;
}

function shape(row, tags, { answers = false, solved } = {}) {
  const out = {
    id: row.id, title: row.title, prompt: row.prompt, rule: row.rule, boardSize: row.board_size,
    stones: JSON.parse(row.stones), toMove: row.to_move, mode: row.mode, level: row.level, status: row.status,
    tags, author: row.author_name ? { username: row.author_username, displayName: row.author_name } : undefined,
    createdAt: row.created_at,
  };
  if (answers) out.answers = JSON.parse(row.answers);
  if (solved !== undefined) out.solved = solved;
  return out;
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

/** One puzzle. Not-approved ones are visible to their author and admins only (with answers). */
function getPuzzle(viewerId, id) {
  const row = db().prepare(`${AUTHOR_JOIN} WHERE p.id = ?`).get(String(id).slice(0, 64));
  const privileged = !!row && !!viewerId && (row.author_id === viewerId || isAdmin(viewerId));
  if (!row || (row.status !== 'approved' && !privileged)) throw new PuzzleError('PUZZLE_NOT_FOUND', 404, 'Không tìm thấy puzzle.');
  const prog = viewerId ? db().prepare('SELECT solved_at FROM puzzle_progress WHERE user_id = ? AND puzzle_id = ?').get(viewerId, row.id) : null;
  return shape(row, tagsOf([row.id]).get(row.id), { answers: privileged, solved: viewerId ? !!(prog && prog.solved_at) : undefined });
}

/** Check a solver's moves against the accepted answers. Records an attempt (and the first solve). */
function solve(userId, id, rawMoves) {
  const row = db().prepare('SELECT id, status, mode, answers, author_id, board_size FROM puzzles WHERE id = ?').get(String(id).slice(0, 64));
  if (!row || row.status !== 'approved') throw new PuzzleError('PUZZLE_NOT_FOUND', 404, 'Không tìm thấy puzzle.');
  const size = row.board_size;
  const moves = Array.isArray(rawMoves) && rawMoves.length <= size * size ? rawMoves.map((c) => toCell(c, size)) : null;
  if (!moves || !moves.length || moves.some((c) => !c)) throw bad('PUZZLE_MOVES_INVALID', 'Tọa độ không hợp lệ.');
  const same = (a, b) => a.length === b.length && a.every((c, k) => c.x === b[k].x && c.y === b[k].y);
  const correct = JSON.parse(row.answers).some((a) => same(a, moves));
  const now = new Date().toISOString();
  db().transaction(() => {
    db().prepare('INSERT OR IGNORE INTO puzzle_progress (user_id, puzzle_id) VALUES (?, ?)').run(userId, row.id);
    db().prepare('UPDATE puzzle_progress SET attempts = attempts + 1 WHERE user_id = ? AND puzzle_id = ?').run(userId, row.id);
    if (correct) db().prepare('UPDATE puzzle_progress SET solved_at = COALESCE(solved_at, ?) WHERE user_id = ? AND puzzle_id = ?').run(now, userId, row.id);
  })();
  return { correct };
}

/** The author's own puzzles, every status, with the reviewer's note. */
function mine(userId) {
  const rows = db().prepare(`${AUTHOR_JOIN} WHERE p.author_id = ? ORDER BY p.created_at DESC, p.id`).all(userId);
  const tags = tagsOf(rows.map((r) => r.id));
  return rows.map((r) => ({ ...shape(r, tags.get(r.id), { answers: true }), reviewNote: r.review_note }));
}

function requireAdmin(userId) {
  if (!isAdmin(userId)) throw new PuzzleError('PUZZLE_FORBIDDEN', 403, 'Bạn không có quyền.');
}

/** Pending puzzles, oldest first, each with how many OTHER puzzles share its position. */
function reviewQueue(adminId, { page } = {}) {
  requireAdmin(adminId);
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const total = db().prepare("SELECT COUNT(*) AS n FROM puzzles WHERE status = 'pending'").get().n;
  const rows = db().prepare(`${AUTHOR_JOIN} WHERE p.status = 'pending' ORDER BY p.created_at, p.id LIMIT ? OFFSET ?`).all(PAGE, (pg - 1) * PAGE);
  const tags = tagsOf(rows.map((r) => r.id));
  const dup = db().prepare('SELECT COUNT(*) AS n FROM puzzles WHERE position_hash = ? AND id != ?');
  return {
    puzzles: rows.map((r) => ({ ...shape(r, tags.get(r.id), { answers: true }), duplicates: dup.get(r.position_hash, r.id).n })),
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

module.exports = {
  statsFor, LEVEL_THRESHOLD,
  PuzzleError, RULES, LEVELS, TAGS, MODES, BOARD_SIZES, MAX_PENDING_PER_USER, isAdmin,
  createPuzzle, updatePuzzle, listApproved, getPuzzle, solve, mine, reviewQueue, review,
};
