'use strict';

/**
 * build-sim-db.js — builds exports/vncaro-sim.db, a project-shaped SQLite DB filled from the vncaro.com crawl
 * in exports/ (users, ratings, rating_history, games, player_games = real data) plus seeded synthetic filler
 * for friendships, clubs, forum, news, notifications and DMs.
 *
 * Own connection + migrate.js on purpose: db/connection.js starts the backup scheduler (server/db/backups).
 * Never writes server/db/gomoku.db. Deterministic (fixed RNG seed). Usage: node tools/build-sim-db.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { runMigrations } = require('../server/db/migrate');
const { upgradeLegacy, ensureOauthUniqueIndex } = require('../server/db/legacy-upgrade');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'exports', 'vncaro-sim.db');
if (path.resolve(OUT) === path.join(ROOT, 'server', 'db', 'gomoku.db')) throw new Error('refusing to overwrite the real DB');

const ranking = require('../exports/user_ranking.json');
const games = require('../exports/live_games_detail.json');

// ---------- helpers ----------
let seed = 20261024;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const uuid = (kind, id) => { const h = crypto.createHash('sha1').update(`vncaro:${kind}:${id}`).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const iso = (ms) => new Date(ms).toISOString();
const utcMs = (ngay) => Date.parse(ngay.replace(' ', 'T') + 'Z'); // `ngay` is UTC (newest game predates the crawl by minutes)
const NOW = Date.parse('2026-10-24T13:30:00Z');
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const rdFor = (g) => Math.max(60, 55 + 295 * Math.exp(-g / 8));
const category = (luat) => (luat === 'chan2dau' ? 'caro' : 'freestyle');

// ---------- users ----------
const byLive = new Map(); // live id -> { uid, name, elo, total, ... }
for (const r of ranking) byLive.set(r.id, { live: r.id, name: r.username, elo: r.elo, total: r.total_ranked_games, wins: r.wins });
for (const v of games) for (const p of [v.X, v.O]) if (p && !byLive.has(p.id)) byLive.set(p.id, { live: p.id, name: p.ten, elo: p.elo || 1200, total: 0, extra: true });
for (const u of byLive.values()) { u.uid = uuid('user', u.live); u.first = Infinity; u.last = 0; u.hist = {}; u.n = 0; }

const sorted = [...games].sort((a, b) => a.id - b.id);
const used = new Set();
const handle = (name, live) => { let h = slug(name).slice(0, 20); if (h.length < 3) h = `nguoi_${live}`.slice(0, 20); let c = h, i = 2; while (used.has(c)) { const s = String(i++); c = h.slice(0, 20 - s.length) + s; } used.add(c); return c; };

// ---------- games ----------
const five = (board, n, x, y, color) => {
  for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
    let c = 1;
    for (const s of [1, -1]) { let a = x + dx * s, b = y + dy * s; while (a >= 0 && b >= 0 && a < n && b < n && board.get(a * 64 + b) === color) { c++; a += dx * s; b += dy * s; } }
    if (c >= 5) return true;
  }
  return false;
};

const gameRows = [], pgRows = [], rhRaw = [];
let noWinner = 0;
for (const v of sorted) {
  const X = byLive.get(v.X.id), O = byLive.get(v.O.id);
  const mv = v.nuocDi || [];
  const nhip = v.nhip || [];
  let t = 0; const cum = mv.map((_, i) => (t += Math.max(1, nhip[i] == null ? 3 : nhip[i])));
  const endMs = utcMs(v.ngay), startMs = endMs - t * 1000;
  let maxc = 0; for (const [a, b] of mv) maxc = Math.max(maxc, a, b);
  for (const [a, b] of v.oCam || []) maxc = Math.max(maxc, a, b);
  const size = maxc <= 14 ? 15 : maxc <= 16 ? 17 : maxc <= 18 ? 19 : 20;
  const moves = mv.map(([a, b], i) => ({ x: b, y: a, color: i % 2 ? 'WHITE' : 'BLACK', timestamp: startMs + cum[i] * 1000 }));
  let winner = null, wc = null;
  if (v.hoa) { winner = 'draw'; wc = 'DRAW'; } else if (v.thang === v.X.id) { winner = wc = 'BLACK'; } else if (v.thang === v.O.id) { winner = wc = 'WHITE'; } else noWinner++;
  let reason = null;
  if (winner === 'draw') reason = 'agreement';
  else if (winner) {
    const board = new Map(); moves.forEach((m) => board.set(m.x * 64 + m.y, m.color));
    const last = [...moves].reverse().find((m) => m.color === wc);
    if (last && five(board, size, last.x, last.y, wc)) reason = 'win';
    else { const li = moves.map((m) => m.color).lastIndexOf(wc === 'BLACK' ? 'WHITE' : 'BLACK'); reason = li >= 0 && (nhip[li] || 0) >= (v.giay || 45) * 0.9 ? 'timeout' : 'resign'; }
  }
  const walls = (v.oCam || []).map(([a, b]) => ({ x: b, y: a }));
  const portals = (v.xuyenKhong || []).map(([p, q]) => ({ a: { x: p[1], y: p[0] }, b: { x: q[1], y: q[0] } }));
  const gid = uuid('game', v.id);
  gameRows.push([gid, `#${(v.id).toString(36).toUpperCase()}`, X.uid, O.uid, X.name, O.name, winner, wc, reason, size, walls.length ? 1 : 0, portals.length ? 1 : 0,
    JSON.stringify(moves), JSON.stringify(walls), JSON.stringify(portals), iso(startMs), iso(endMs), v.gameType === 'ranked' ? 1 : 0]);
  pgRows.push([X.uid, gid], [O.uid, gid]);
  for (const u of [X, O]) { u.first = Math.min(u.first, startMs); u.last = Math.max(u.last, endMs); u.n++; }
  if (v.gameType === 'ranked') {
    const cat = category(v.luat);
    for (const [u, side, opp] of [[X, v.X, O], [O, v.O, X]]) {
      const score = winner === 'draw' ? 0.5 : (wc === 'BLACK') === (u === X) ? 1 : 0;
      (u.hist[cat] ||= []).push({ gid, opp: opp.uid, score, before: side.elo || 1200, at: iso(endMs) });
    }
  }
}

// ---------- ratings / history ----------
const ratingRows = [], histRows = [];
let droppedHist = 0;
for (const u of byLive.values()) {
  u.created = u.first === Infinity ? Date.parse('2026-08-01T00:00:00Z') + int(0, 60) * 864e5 : u.first - int(0, 4 * 864e5 / 1000) * 1000 - 3600e3;
  if (!u.last) u.last = u.created;
  // One ratings row per user: the live ELO goes to the main category (most ranked games); the other stays empty.
  const cats = Object.keys(u.hist).sort((a, b) => u.hist[b].length - u.hist[a].length);
  const cat = cats[0] || 'freestyle';
  for (const other of cats.slice(1)) droppedHist += u.hist[other].length;
  const h = u.hist[cat] || [];
  h.forEach((r, i) => {
    const after = i + 1 < h.length ? h[i + 1].before : u.elo;
    histRows.push([u.uid, cat, r.gid, r.opp, r.score, r.before, after, rdFor(i), rdFor(i + 1), r.at]);
  });
  const count = Math.max(h.length, u.total || 0);
  ratingRows.push([u.uid, cat, u.elo, rdFor(count), 0.06 + (rnd() - 0.5) * 0.0004, count, iso(u.last)]);
}

// ---------- build ----------
for (const f of [OUT, `${OUT}-wal`, `${OUT}-shm`]) if (fs.existsSync(f)) fs.unlinkSync(f);
const db = new Database(OUT);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
runMigrations(db, { dir: path.join(ROOT, 'server/db/migrations'), schemaSql: fs.readFileSync(path.join(ROOT, 'server/db/schema.sql'), 'utf8'), legacy: upgradeLegacy });
ensureOauthUniqueIndex(db);

const ins = (sql) => db.prepare(sql);
const stats = {};
db.transaction(() => {
  // users (+ one synthetic staff account for news authorship)
  const iu = ins('INSERT INTO users (id, username, password_hash, display_name, created_at, last_login_at, country) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const staff = uuid('user', 'staff');
  for (const u of byLive.values()) { u.handle = handle(u.name, u.live); iu.run(u.uid, u.handle, '!', u.name, iso(u.created), iso(u.last), 'VN'); }
  const handleOf = new Map([...byLive.values()].map((u) => [u.uid, u.handle]));
  db.prepare("INSERT INTO users (id, username, password_hash, display_name, created_at, role) VALUES (?, 'ban_quan_tri', '!', 'Ban quản trị', ?, 'admin')").run(staff, '2026-07-01T00:00:00.000Z');
  const ig = ins('INSERT INTO games (id, room_id, black_player_id, white_player_id, black_player_name, white_player_name, winner, winner_color, reason, board_size, rule_wall, rule_portal, moves, walls, portals, started_at, ended_at, ranked) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
  for (const r of gameRows) ig.run(...r);
  const ip = ins('INSERT INTO player_games (player_id, game_id) VALUES (?, ?)');
  for (const r of pgRows) ip.run(...r);
  const ir = ins('INSERT INTO ratings (user_id, category, rating, rd, volatility, games, updated_at) VALUES (?,?,?,?,?,?,?)');
  for (const r of ratingRows) ir.run(...r);
  const ih = ins('INSERT INTO rating_history (user_id, category, game_id, opponent_id, score, rating_before, rating_after, rd_before, rd_after, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
  for (const r of histRows) ih.run(...r);

  // ---- synthetic filler ----
  const users = [...byLive.values()];
  const active = users.filter((u) => u.n >= 20);
  const idOf = new Map(users.map((u) => [u.uid, u]));
  const after = (u, v) => Math.max(u.created, v.created) + int(1, 30) * 864e5;

  // friendships from frequent opponents
  const pair = new Map();
  for (const r of gameRows) { const a = r[2], b = r[3]; const k = a < b ? `${a}|${b}` : `${b}|${a}`; pair.set(k, (pair.get(k) || 0) + 1); }
  const pairs = [...pair.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 4000);
  const ifr = ins('INSERT INTO friendships (user_a, user_b, requested_by, status, created_at) VALUES (?,?,?,?,?)');
  const fr = [];
  const notif = [];
  for (const [k] of pairs) {
    const [a, b] = k.split('|'); const ua = idOf.get(a), ub = idOf.get(b);
    const status = rnd() < 0.88 ? 'accepted' : 'pending';
    const req = rnd() < 0.5 ? a : b; const at = Math.min(after(ua, ub), NOW - 864e5);
    ifr.run(a, b, req, status, iso(at)); fr.push({ a, b, status, req, at });
    const other = req === a ? b : a;
    const who = (id) => ({ username: handleOf.get(id), displayName: idOf.get(id).name });
    // pending: the other side gets a request from the requester; accepted: the requester hears from the accepter
    if (status === 'pending') notif.push([other, 'friend_request', req, JSON.stringify({ from: who(req) }), rnd() < 0.7 ? iso(at + 3600e3) : null, iso(at)]);
    else notif.push([req, 'friend_accepted', other, JSON.stringify({ from: who(other) }), rnd() < 0.7 ? iso(at + 3600e3) : null, iso(at + 3600e3)]);
  }

  // clubs
  const COLORS = ['blue', 'green', 'red', 'orange', 'purple', 'teal', 'pink', 'gray'];
  const clubNames = ['Cờ Caro Hà Nội', 'Caro Sài Gòn', 'Cao Thủ Miền Trung', 'Hội Caro Sinh Viên', 'Đại Việt Caro', 'Caro Đà Nẵng', 'Tân Binh Caro', 'Thách Đấu 1700', 'Caro Cần Thơ', 'Vạn Xuân Caro', 'Caro Hải Phòng', 'Hội Bạn Cờ Caro'];
  const ic = ins('INSERT INTO clubs (id, slug, name, description, join_policy, owner_id, created_at, color, tag) VALUES (?,?,?,?,?,?,?,?,?)');
  const im = ins('INSERT INTO club_members (club_id, user_id, role, joined_at) VALUES (?,?,?,?)');
  clubNames.forEach((name, i) => {
    const cid = uuid('club', i); const owner = pick(active.slice(0, 300)); const created = Math.max(owner.created, Date.parse('2026-08-10T00:00:00Z')) + int(0, 30) * 864e5;
    ic.run(cid, slug(name).replace(/_/g, '-'), name, `Câu lạc bộ ${name} — nơi giao lưu và luyện tập cờ caro.`, rnd() < 0.7 ? 'open' : 'invite', owner.uid, iso(created), COLORS[i % 8], slug(name).slice(0, 4).toUpperCase());
    im.run(cid, owner.uid, 'owner', iso(created));
    const members = new Set([owner.uid]); const size = Math.floor(15 + 185 * Math.pow(rnd(), 2.2));
    while (members.size < size) { const u = pick(rnd() < 0.8 ? active : users); if (members.has(u.uid)) continue; members.add(u.uid); im.run(cid, u.uid, members.size <= 4 ? 'officer' : 'member', iso(Math.min(NOW - 864e5, Math.max(created, u.created) + int(0, 40) * 864e5))); }
  });

  // forum
  const CATS = ['general', 'tactics', 'analysis', 'help'];
  const titles = { general: ['Chào mọi người', 'Giải đấu cuối tuần này', 'Gợi ý tính năng mới', 'Tìm bạn cùng chơi'], tactics: ['Cách mở đầu khi cầm quân đen', 'Chiến thuật chặn 3 hai đầu', 'Bẫy 4-3 hay gặp'], analysis: ['Phân tích ván hay nhất tuần', 'Sai lầm ở nước thứ 12', 'Tại sao ván này thua?'], help: ['Không vào được phòng', 'Hỏi luật 4 ô cấm', 'Làm sao lên hạng nhanh?'] };
  const bodies = ['Mình mới chơi, mong mọi người chỉ giáo thêm.', 'Ai có kinh nghiệm chia sẻ giúp mình với nhé.', 'Theo mình thì nên ưu tiên giữ thế chủ động từ đầu ván.', 'Cảm ơn bạn, mình sẽ thử áp dụng.', 'Ván này mình thấy nước chặn hơi muộn.', 'Đồng ý với bạn, đoạn giữa ván rất quan trọng.'];
  const ift = ins('INSERT INTO forum_threads (id, category, author_id, title, body, created_at, last_post_at, reply_count) VALUES (?,?,?,?,?,?,?,?)');
  const ifp = ins('INSERT INTO forum_posts (id, thread_id, author_id, body, created_at) VALUES (?,?,?,?,?)');
  for (let i = 0; i < 240; i++) {
    const cat = pick(CATS); const au = pick(active); const t0 = NOW - int(1, 90) * 864e5 - int(0, 86399) * 1000; const tid = uuid('thread', i);
    const replies = Math.floor(12 * Math.pow(rnd(), 2)); let last = t0;
    ift.run(tid, cat, au.uid, pick(titles[cat]), pick(bodies), iso(t0), iso(t0), replies);
    for (let j = 0; j < replies; j++) { last += int(60, 86400) * 1000; if (last > NOW) last = NOW; ifp.run(uuid('post', `${i}-${j}`), tid, pick(active).uid, pick(bodies), iso(last)); }
    db.prepare('UPDATE forum_threads SET last_post_at = ? WHERE id = ?').run(iso(last), tid);
  }

  // news
  const inw = ins('INSERT INTO news (id, body, link, author_id, created_at, updated_at) VALUES (?,?,?,?,?,?)');
  ['Chào mừng đến với VNCaro!', 'Giải đấu cuối tuần mở đăng ký.', 'Cập nhật luật 4 ô cấm.', 'Bảo trì hệ thống lúc 2 giờ sáng.', 'Bảng xếp hạng tháng đã được làm mới.'].forEach((b, i) => { const at = iso(NOW - (i + 1) * 5 * 864e5); inw.run(uuid('news', i), b, i === 1 ? '/forum' : null, staff, at, at); });

  // DMs between friends
  const idm = ins('INSERT INTO direct_messages (conv_key, sender_id, recipient_id, body, created_at, read_at) VALUES (?,?,?,?,?,?)');
  const lines = ['Chơi một ván không?', 'Ok, vào phòng đi.', 'Ván vừa rồi hay quá.', 'Mai có giải, bạn tham gia không?', 'Mình đang bận, lát nhé.', 'Gặp lại sau nhé!'];
  const acc = fr.filter((f) => f.status === 'accepted'); const dms = [];
  for (let i = 0; i < 1500; i++) {
    const f = pick(acc); let t = f.at + int(1, 20) * 3600e3; let from = f.a;
    for (let j = int(2, 10); j > 0 && t < NOW; j--) { const to = from === f.a ? f.b : f.a; dms.push([`${f.a}|${f.b}`, from, to, pick(lines), iso(t), rnd() < 0.85 ? iso(t + 600e3) : null]); from = rnd() < 0.7 ? to : from; t += int(30, 7200) * 1000; }
    if (rnd() < 0.15) { const text = pick(lines); notif.push([f.b, 'dm', f.a, JSON.stringify({ from: { username: handleOf.get(f.a), displayName: idOf.get(f.a).name }, text }), null, iso(t)]); }
  }
  // ids must follow time: DmService reads MAX(id) as the latest message of a conversation
  dms.sort((x, y) => x[4].localeCompare(y[4]));
  for (const d of dms) idm.run(...d);
  const inn = ins('INSERT INTO notifications (user_id, type, actor_id, payload, read_at, created_at) VALUES (?,?,?,?,?,?)');
  notif.sort((x, y) => x[5].localeCompare(y[5]));
  for (const n of notif) inn.run(...n);
  Object.assign(stats, { friendships: fr.length, notifications: notif.length, dms: dms.length });
})();

db.pragma('wal_checkpoint(TRUNCATE)');
db.pragma('journal_mode = DELETE');
const one = (q) => db.prepare(q).get();
console.log({
  users: one('SELECT COUNT(*) n FROM users').n, games: one('SELECT COUNT(*) n FROM games').n, player_games: one('SELECT COUNT(*) n FROM player_games').n,
  ratings: one('SELECT COUNT(*) n FROM ratings').n, rating_history: one('SELECT COUNT(*) n FROM rating_history').n, gamesWithoutWinner: noWinner, droppedMinorCategoryHistory: droppedHist, ...stats,
  user_version: db.pragma('user_version', { simple: true }), fk_violations: db.pragma('foreign_key_check').length, integrity: db.pragma('integrity_check', { simple: true }),
});
db.close();
