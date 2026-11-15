'use strict';

/**
 * slow-routes.js — B384: which read routes hold the game thread, and for how long.
 * Boots the real app in-process on a COPY of the given DB, signs in as its busiest member and its
 * first admin, GETs every read route RUNS times, then prints per route the wall ms and — the number
 * that matters for move acks — the longest event-loop stall, plus the slowest statements with plans.
 *
 * Run: node server/scripts/slow-routes.js <db-file> [runs=5]     e.g. exports/vncaro-sim.db
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const SRC = process.argv[2] && path.resolve(process.argv[2]);
const RUNS = Number(process.argv[3]) || 5;
if (!SRC || !fs.existsSync(SRC)) { console.error('usage: node server/scripts/slow-routes.js <db-file> [runs]'); process.exit(2); }

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomoku-slow-'));
const COPY = path.join(dir, 'copy.db');
fs.copyFileSync(SRC, COPY); // never time against (or migrate) the source file
process.env.GOMOKU_DB_PATH = COPY;
process.env.PORT = process.env.PORT || '3119';
process.env.SLOW_QUERY_MS = process.env.SLOW_QUERY_MS || '5';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';

const config = require('../config');
const { db } = require('../db/connection');
const slow = require('../db/slow-query');
const sessionManager = require('../managers/SessionManager');
if (process.env.SLOW_ROUTES_TRACE) console.error('db ready, booting app');
const { server } = require('../index');

const one = (sql, ...a) => db.prepare(sql).get(...a);
const member = one(`SELECT u.id, u.username, u.display_name FROM users u JOIN player_games pg ON pg.player_id = u.id
                    GROUP BY u.id ORDER BY COUNT(*) DESC LIMIT 1`) || one('SELECT id, username, display_name FROM users LIMIT 1');
const admin = one(`SELECT id, username, display_name FROM users WHERE role = 'admin' LIMIT 1`);
const game = one('SELECT id FROM games ORDER BY ended_at DESC LIMIT 1');
const club = one('SELECT slug FROM clubs ORDER BY (SELECT COUNT(*) FROM club_members m WHERE m.club_id = clubs.id) DESC LIMIT 1');
const thread = one('SELECT id FROM forum_threads ORDER BY id DESC LIMIT 1');
const peer = one(`SELECT u.username, u.id FROM direct_messages d JOIN users u ON u.id = CASE WHEN d.sender_id = ? THEN d.recipient_id ELSE d.sender_id END
                  WHERE d.sender_id = ? OR d.recipient_id = ? LIMIT 1`, member.id, member.id, member.id);
const cat = one('SELECT category FROM ratings GROUP BY category ORDER BY COUNT(*) DESC LIMIT 1');

const cookieFor = (u) => u && `${config.SESSION_COOKIE_NAME}=${sessionManager.createSession({ userId: u.id, displayName: u.display_name, isGuest: false }).id}`;
const M = cookieFor(member), A = cookieFor(admin);
const name2 = member.display_name.slice(0, 2);
const C = cat ? cat.category : '';

/** [label, path, cookie] — every GET a page issues on load or on a keystroke. */
const ROUTES = [
  ['home', '/api/home', M],
  ['shell', '/api/shell', M],
  ['rankings p1', `/api/rankings?category=${C}`, null],
  ['rankings p10', `/api/rankings?category=${C}&page=10`, null],
  ['rankings search', `/api/rankings?category=${C}&q=${encodeURIComponent(name2)}`, null],
  ['rankings friends', `/api/rankings?category=${C}&scope=friends`, M],
  ['rankings club', `/api/rankings?category=${C}&scope=club`, M],
  ['rankings vn', `/api/rankings?category=${C}&scope=vn`, null],
  ['rankings me', `/api/rankings/me?category=${C}`, M],
  ['games p1', '/api/games', null],
  ['games p500', '/api/games?page=500', null],
  ['games player filter', `/api/games?player=${encodeURIComponent(name2)}`, null],
  ['games stats', '/api/games/stats', null],
  ['game by id', game && `/api/games/${game.id}`, null],
  ['profile', `/api/profile/${member.username}`, M],
  ['profile games', `/api/profile/${member.username}/games`, M],
  ['profile rating-history', `/api/profile/${member.username}/rating-history?category=${C}`, M],
  ['profile card', `/api/profile/card/${member.id}`, M],
  ['friends', '/api/friends', M],
  ['friends search', `/api/friends/search?q=${encodeURIComponent(name2)}`, M],
  ['friend summary', peer && `/api/friends/${peer.username}/summary`, M],
  ['notifications', '/api/notifications', M],
  ['dm list', '/api/dm', M],
  ['dm thread', peer && `/api/dm/${peer.username}`, M],
  ['challenges', '/api/challenges', M],
  ['clubs', '/api/clubs', null],
  ['clubs mine', '/api/clubs/mine', M],
  ['club', club && `/api/clubs/${club.slug}`, M],
  ['club members', club && `/api/clubs/${club.slug}/members`, M],
  ['club messages', club && `/api/clubs/${club.slug}/messages`, M],
  ['forum threads', '/api/forum/threads', null],
  ['forum thread', thread && `/api/forum/threads/${thread.id}`, null],
  ['puzzles', '/api/puzzles', null],
  ['admin users', '/api/admin/users', A],
  ['admin users search', `/api/admin/users?q=${encodeURIComponent(name2)}`, A],
  ['admin user', `/api/admin/users/${member.id}`, A],
  ['admin cheat-reports', '/api/admin/cheat-reports', A],
  ['admin rating-integrity', '/api/admin/rating-integrity', A],
].filter((r) => r[1] && (r[2] !== undefined));

const loop = require('perf_hooks').monitorEventLoopDelay({ resolution: 1 });
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

server.on('listening', async () => {
  const base = `http://127.0.0.1:${process.env.PORT}`;
  const rows = [];
  for (const [label, url, cookie] of ROUTES) {
    if (cookie === null && /admin/.test(label)) continue;
    const ms = []; let status = 0; let stall = 0;
    if (process.env.SLOW_ROUTES_TRACE) console.error('→', label, url);
    for (let i = 0; i < RUNS; i++) {
      if (i === 1) { loop.reset(); loop.enable(); } // run 0 is the cold one
      const t0 = process.hrtime.bigint();
      const r = await fetch(base + url, { headers: { origin: base, ...(cookie ? { cookie } : {}) } });
      await r.arrayBuffer();
      status = r.status;
      ms.push(Number(process.hrtime.bigint() - t0) / 1e6);
    }
    loop.disable(); stall = loop.max / 1e6;
    rows.push({ label, status, stall, first: ms[0], med: median(ms.slice(1)), worst: Math.max(...ms.slice(1)) });
  }
  console.log(`\nDB ${SRC} (${(fs.statSync(SRC).size / 1e6).toFixed(0)} MB), member=${member.username}, runs=${RUNS}`);
  console.log('route                      status  first(cold) ms   median ms   worst ms   loop stall ms   (wall = HTTP + JSON + queries; stall = longest time the game thread was held)');
  for (const r of rows.sort((a, b) => b.stall - a.stall)) {
    console.log(`${r.label.padEnd(26)} ${String(r.status).padEnd(6)} ${r.first.toFixed(1).padStart(12)} ${r.med.toFixed(1).padStart(11)} ${r.worst.toFixed(1).padStart(10)} ${r.stall.toFixed(1).padStart(14)}`);
  }
  console.log(`\nstatements with a call ≥ 1 ms (worst first):`);
  for (const s of slow.stats(40)) {
    if (s.maxMs < 1) break;
    console.log(`\n  max ${s.maxMs.toFixed(1)} ms · avg ${s.avgMs.toFixed(2)} ms · n=${s.n}\n  ${s.sql.replace(/\s+/g, ' ').slice(0, 400)}`);
    try {
      const n = (s.sql.match(/\?/g) || []).length;
      for (const p of db.prepare('EXPLAIN QUERY PLAN ' + s.sql).all(...Array(n).fill(null))) console.log('    plan: ' + p.detail);
    } catch (e) { console.log('    plan: n/a (' + e.message.slice(0, 60) + ')'); }
  }
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
});
