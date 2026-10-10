'use strict';

/**
 * CheatReportService.js — member reports of suspected cheating in a finished casual game (R8, #208).
 * Members report one seat; staff (perm cheat.review) dismiss or confirm. Confirming writes a
 * `cheat_confirm` edge actor → accused into the admin change graph; it never penalises by itself.
 */

const crypto = require('crypto');
const database = require('../db/database');
const roles = require('../utils/roles');
const adminUsers = require('./AdminUserService');

const db = () => database.db;
const REASON_MAX = 200;
const PER_DAY = 10;
const PAGE = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

class CheatReportError extends Error {
  constructor(code, status, message) {
    super(message);
    this.name = 'CheatReportError';
    this.code = code;
    this.status = status;
  }
}
const bad = (code, message) => new CheatReportError(code, 400, message);

function requireStaff(userId) {
  if (!roles.can(userId, 'cheat.review')) throw new CheatReportError('CHEAT_FORBIDDEN', 403, 'Bạn không có quyền.');
}

/** A member reports the BLACK or WHITE seat of a finished game. A repeat of the same report is a no-op. */
function report(userId, gameId, { side, reason } = {}) {
  const game = db().prepare('SELECT id, black_player_id, white_player_id, ended_at FROM games WHERE id = ?').get(String(gameId).slice(0, 64));
  if (!game) throw new CheatReportError('GAME_NOT_FOUND', 404, 'Không tìm thấy ván đấu.');
  if (!game.ended_at) throw bad('CHEAT_GAME_NOT_FINISHED', 'Chỉ báo cáo được ván đã kết thúc.');
  if (side !== 'BLACK' && side !== 'WHITE') throw bad('CHEAT_SIDE_INVALID', 'Chọn người chơi cần báo cáo.');
  const accused = side === 'BLACK' ? game.black_player_id : game.white_player_id;
  if (!accused) throw bad('CHEAT_TARGET_GUEST', 'Không báo cáo được người chơi khách.');
  if (accused === userId) throw bad('CHEAT_SELF', 'Không thể tự báo cáo mình.');
  const text = typeof reason === 'string' ? reason.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim() : '';
  if (!text || text.length > REASON_MAX) throw bad('CHEAT_REASON_INVALID', `Lý do dài 1–${REASON_MAX} ký tự.`);
  return db().transaction(() => {
    const dup = db().prepare('SELECT 1 FROM game_reports WHERE reporter_id = ? AND game_id = ? AND accused_id = ?').get(userId, game.id, accused);
    if (dup) return { ok: true };
    const since = new Date(Date.now() - DAY_MS).toISOString();
    const n = db().prepare('SELECT COUNT(*) AS n FROM game_reports WHERE reporter_id = ? AND created_at > ?').get(userId, since).n;
    if (n >= PER_DAY) throw new CheatReportError('CHEAT_RATE_LIMITED', 429, 'Bạn báo cáo quá nhiều hôm nay.');
    db().prepare('INSERT INTO game_reports (id, game_id, reporter_id, accused_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), game.id, userId, accused, text, new Date().toISOString());
    return { ok: true };
  })();
}

/** Open reports, oldest first, with the game summary and the accused's history. Staff only. */
function openReports(staffId, { page } = {}) {
  requireStaff(staffId);
  const pg = Math.max(1, parseInt(page, 10) || 1);
  const total = db().prepare('SELECT COUNT(*) AS n FROM game_reports WHERE resolved_at IS NULL').get().n;
  const rows = db().prepare('SELECT * FROM game_reports WHERE resolved_at IS NULL ORDER BY created_at, id LIMIT ? OFFSET ?').all(PAGE, (pg - 1) * PAGE);
  const user = db().prepare('SELECT id, username, display_name FROM users WHERE id = ?');
  const game = db().prepare('SELECT id, black_player_name, white_player_name, black_player_id, white_player_id, winner, reason, ended_at FROM games WHERE id = ?');
  const count = db().prepare('SELECT COUNT(DISTINCT game_id) AS n FROM game_reports WHERE accused_id = ? AND resolved_at IS NULL');
  const confirmed = db().prepare("SELECT COUNT(DISTINCT game_id) AS n FROM game_reports WHERE accused_id = ? AND resolution = 'confirmed'");
  const reports = rows.map((r) => {
    const acc = user.get(r.accused_id);
    const rep = user.get(r.reporter_id);
    const g = game.get(r.game_id);
    return {
      id: r.id, reason: r.reason, createdAt: r.created_at,
      accused: acc ? { id: acc.id, username: acc.username, displayName: acc.display_name } : { id: r.accused_id, username: '', displayName: '(đã xoá)' },
      reporter: { displayName: rep ? rep.display_name : '(đã xoá)' },
      game: g ? {
        id: g.id, black: g.black_player_name, white: g.white_player_name, endedAt: g.ended_at,
        accusedSide: g.black_player_id === r.accused_id ? 'BLACK' : 'WHITE',
      } : null,
      accusedOpenGames: count.get(r.accused_id).n,
      accusedConfirmedGames: confirmed.get(r.accused_id).n,
    };
  });
  return { reports, pagination: { page: pg, limit: PAGE, total, totalPages: Math.ceil(total / PAGE) } };
}

/** Close a report (and every other open report on the same game + accused). `confirm` also logs a graph edge. */
function resolve(staffId, reportId, { confirm } = {}) {
  requireStaff(staffId);
  return db().transaction(() => {
    const r = db().prepare('SELECT * FROM game_reports WHERE id = ?').get(String(reportId).slice(0, 64));
    if (!r) throw new CheatReportError('CHEAT_REPORT_NOT_FOUND', 404, 'Không tìm thấy báo cáo.');
    if (r.resolved_at) throw new CheatReportError('CHEAT_REPORT_CLOSED', 409, 'Báo cáo này đã được xử lý.');
    const resolution = confirm === true ? 'confirmed' : 'dismissed';
    db().prepare('UPDATE game_reports SET resolved_at = ?, resolved_by = ?, resolution = ? WHERE game_id = ? AND accused_id = ? AND resolved_at IS NULL')
      .run(new Date().toISOString(), staffId, resolution, r.game_id, r.accused_id);
    if (confirm === true) adminUsers.addEdge(staffId, 'cheat_confirm', r.accused_id, { gameId: r.game_id });
    return { ok: true, resolution };
  })();
}

module.exports = { CheatReportError, REASON_MAX, PER_DAY, report, openReports, resolve };
