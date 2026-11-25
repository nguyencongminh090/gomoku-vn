'use strict';

const database = require('../db/database');
const roles = require('../utils/roles');
const { ClubError, getClub, clubHistory, removeContent } = require('./ClubService');
const { KINDS, removeImage } = require('../utils/club-image-store');
const db = database.db;

function authorize(userId) {
  if (!roles.can(userId, 'club.manage')) throw new ClubError('CLUB_FORBIDDEN', 403, 'Chỉ quản trị viên hệ thống được thực hiện tác vụ này.');
}

function audit(actor, club, action, detail = '') {
  db.prepare('INSERT INTO club_admin_log(actor_id,club_id,slug,action,detail,created_at) VALUES(?,?,?,?,?,?)')
    .run(actor, club?.id || null, club?.slug || null, action, detail, new Date().toISOString());
}

function directory(actor, query) {
  authorize(actor);
  const q = String(query.q || '').trim().toLowerCase().slice(0, 60);
  const page = Math.max(1, Math.min(1000000, Number.parseInt(query.page, 10) || 1));
  const where = 'WHERE instr(lower(name),?) OR instr(slug,?)';
  const clubs = db.prepare(`SELECT slug,name,hidden,locked FROM clubs ${where} ORDER BY slug LIMIT 30 OFFSET ?`).all(q, q, (page - 1) * 30);
  const total = db.prepare('SELECT count(*) AS n FROM clubs ' + where).get(q,q).n;
  const reports = db.prepare(`SELECT r.id,r.reason,r.excerpt,c.slug,c.name FROM club_reports r JOIN clubs c ON c.id=r.club_id
    WHERE r.resolved_at IS NULL ORDER BY r.id LIMIT 50`).all();
  audit(actor, null, 'list');
  const history = db.prepare(`SELECT l.*,u.username FROM club_admin_log l LEFT JOIN users u ON u.id=l.actor_id
    WHERE action NOT IN ('list','view') ORDER BY l.id DESC LIMIT 100`).all();
  return { clubs, total, page, reports, history };
}

function detail(actor, slug) {
  authorize(actor);
  const club = getClub(slug);
  const messages = db.prepare(`SELECT m.id,m.body,m.kind,u.username FROM club_messages m JOIN users u ON u.id=m.sender_id
    WHERE m.club_id=? ORDER BY m.id DESC LIMIT 200`).all(club.id);
  audit(actor, club, 'view');
  return { slug: club.slug, name: club.name, description: club.description, hidden: !!club.hidden, locked: !!club.locked,
    messages, log: clubHistory(club.id, 500) };
}

function act(actor, slug, { action, id }) {
  authorize(actor);
  const club = getClub(slug);
  db.transaction(() => {
    if (['hide','show','lock','unlock'].includes(action)) {
      const field = ['hide','show'].includes(action) ? 'hidden' : 'locked';
      db.prepare('UPDATE clubs SET ' + field + '=? WHERE id=?').run(Number(action === 'hide' || action === 'lock'), club.id);
    } else if (action === 'delete') {
      db.prepare('DELETE FROM clubs WHERE id=?').run(club.id);
    } else if (['remove','dismiss','uphold'].includes(action) && Number.isSafeInteger(id)) {
      let messageId = id;
      if (action !== 'remove') {
        const report = db.prepare('SELECT message_id,resolved_at FROM club_reports WHERE club_id=? AND id=?').get(club.id,id);
        if (!report) throw new ClubError('CLUB_REPORT_MISSING', 404, 'Không tìm thấy báo cáo.');
        if (report.resolved_at) return;
        messageId = report.message_id;
        db.prepare('UPDATE club_reports SET resolved_at=? WHERE id=?').run(new Date().toISOString(), id);
      }
      if (action !== 'dismiss') {
        const msg = removeContent(club, messageId);
        if (!msg && action === 'remove') throw new ClubError('CLUB_MESSAGE_NOT_FOUND', 404, 'Không tìm thấy tin nhắn.');
        db.prepare('UPDATE club_reports SET resolved_at=? WHERE message_id=? AND resolved_at IS NULL').run(new Date().toISOString(), messageId);
      }
    } else throw new ClubError('CLUB_MOD_INVALID', 400, 'Tác vụ không hợp lệ.');
    audit(actor, club, action, id == null ? '' : String(id));
  })();
  if (action === 'delete') for (const kind of Object.keys(KINDS)) removeImage(club.id, kind);
  return { ok: true };
}

module.exports = { directory, detail, act };
