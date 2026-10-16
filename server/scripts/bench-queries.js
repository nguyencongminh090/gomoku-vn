'use strict';

/**
 * bench-queries.js — B260: rankings search, rank count and game player-name filter at scale.
 * Seeds a THROWAWAY temp DB (never the live file) with recursive CTEs, runs ANALYZE, then prints
 * query plan + median/worst ms at a small and a large size, for old (inline) vs shipped queries.
 *
 * Run: node server/scripts/bench-queries.js [bigGames=100000] [bigUsers=20000]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const BIG_GAMES = Number(process.argv[2]) || 100000;
const BIG_USERS = Number(process.argv[3]) || 20000;
const RUNS = 21;

function seed(tag, nGames, nUsers) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gomoku-bench-')), `${tag}.db`);
  process.env.GOMOKU_DB_PATH = file;
  for (const k of Object.keys(require.cache)) if (/server[\\/]db[\\/]/.test(k)) delete require.cache[k];
  const { db } = require('../db/connection');
  const rankings = require('../db/rankings');
  const games = require('../db/games');
  const now = new Date().toISOString();
  const cte = (n) => `WITH RECURSIVE s(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM s WHERE i < ${n})`; // ints inlined: bound JS numbers are REAL
  db.transaction(() => {
    // Skewed names: a few common stems ('an', 'minh') hit many rows, most hit few.
    db.prepare(`${cte(nUsers)} INSERT INTO users (id, username, password_hash, display_name, created_at)
      SELECT 'u'||i, 'user'||i, 'x', CASE i % 5 WHEN 0 THEN 'Minh ' WHEN 1 THEN 'An ' ELSE 'P' END || i, ? FROM s`).run(now);
    db.prepare(`${cte(nUsers)} INSERT INTO ratings (user_id, category, rating, rd, volatility, games, updated_at)
      SELECT 'u'||i, 'standard', 1000 + (i * 7919) % 1500, 80, 0.06, 1 + i % 50, ? FROM s`).run(now);
    db.prepare(`${cte(nGames)} INSERT INTO games (id, room_id, black_player_id, white_player_id, black_player_name,
        white_player_name, winner_color, board_size, started_at, ended_at)
      SELECT 'g'||i, 'r'||i, 'u'||(1 + i % ${nUsers}), 'u'||(1 + (i * 31) % ${nUsers}), 'user'||(1 + i % ${nUsers}),
             'user'||(1 + (i * 31) % ${nUsers}), 'BLACK', 15, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 1.7e9 + i, 'unixepoch') FROM s`).run(now);
  })();
  db.exec('ANALYZE');
  return { db, rankings, games };
}

function time(fn) {
  for (let i = 0; i < 3; i++) fn();
  const t = [];
  for (let i = 0; i < RUNS; i++) { const a = process.hrtime.bigint(); fn(); t.push(Number(process.hrtime.bigint() - a) / 1e6); }
  t.sort((x, y) => x - y);
  return `median ${t[RUNS >> 1].toFixed(2)} ms, worst ${t[RUNS - 1].toFixed(2)} ms`;
}

const OLD_SEARCH = `SELECT * FROM (SELECT r.user_id, u.username, u.display_name, u.avatar_v, r.rating, r.rd, r.games,
  ROW_NUMBER() OVER (ORDER BY r.rating DESC, r.user_id) AS rank FROM ratings r JOIN users u ON u.id = r.user_id
  WHERE r.category = ? AND r.games >= ?) WHERE username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\'
  ORDER BY rank LIMIT ? OFFSET ?`;

for (const [label, g, u] of [['small', 400, 20], ['big', BIG_GAMES, BIG_USERS]]) {
  const { db, rankings, games } = seed(label, g, u);
  console.log(`\n=== ${label}: ${g} games, ${u} rated users ===`);
  for (const q of ['an', 'minh 1', 'user1234']) {
    console.log(`searchRankings old  q=${JSON.stringify(q)}: ${time(() => db.prepare(OLD_SEARCH).all('standard', 1, `%${q}%`, `%${q}%`, 20, 0))}`);
    console.log(`searchRankings new  q=${JSON.stringify(q)}: ${time(() => rankings.searchRankings('standard', q, 20, 0))}`);
  }
  console.log(`getUserRanking worst-rank user: ${time(() => rankings.getUserRanking(`u${u}`, 'standard'))}`);
  for (const p of ['user1234', 'ser1']) {
    console.log(`getRecentGames player=${p}: ${time(() => games.getRecentGames(20, 0, { player: p }))}`);
    console.log(`getGameCount   player=${p}: ${time(() => games.getGameCount({ player: p }))}`);
  }
  console.log('plan searchRankings:');
  for (const r of db.prepare(`EXPLAIN QUERY PLAN ${OLD_SEARCH}`).all('standard', 1, '%a%', '%a%', 20, 0)) console.log('  old', r.detail);
  db.close();
}
