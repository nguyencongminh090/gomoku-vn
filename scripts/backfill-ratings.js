#!/usr/bin/env node
// Rebuild `ratings` + `rating_history` from every finished game with two distinct members.
// Games.winning rule isn't stored: games with a rating_history row keep that category, the rest count as freestyle.
// Usage: node scripts/backfill-ratings.js [--db <file>] [--apply]   (default: dry run on a temp copy of the DB)
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { rateGame } = require('../server/managers/RatingService');

const arg = (k) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null; };
const src = arg('--db') || path.join(__dirname, '../server/db/gomoku.db');
const apply = process.argv.includes('--apply');
let target = src;
if (!apply) { target = path.join(os.tmpdir(), `ratings-dry-${Date.now()}.db`); fs.copyFileSync(src, target); }
else fs.copyFileSync(src, `${src}.bak-pre-ratings-${Date.now()}`);

const db = new Database(target);
const catOf = new Map(db.prepare('SELECT DISTINCT game_id, category FROM rating_history').all().map((r) => [r.game_id, r.category]));
const games = db.prepare(`SELECT id, black_player_id b, white_player_id w, winner FROM games
  WHERE black_player_id IS NOT NULL AND white_player_id IS NOT NULL AND black_player_id != white_player_id
    AND winner IS NOT NULL ORDER BY ended_at, started_at`).all();

db.transaction(() => {
  db.prepare('DELETE FROM rating_history').run();
  db.prepare('DELETE FROM ratings').run();
  for (const g of games) {
    const winner = g.winner === 'BLACK' ? g.b : g.winner === 'WHITE' ? g.w : g.winner === 'draw' ? 'draw' : null;
    if (!winner) continue;
    rateGame(db, { gameId: g.id, category: catOf.get(g.id) || 'freestyle', players: [{ id: g.b }, { id: g.w }], winner });
  }
})();

const rows = db.prepare(`SELECT r.category, u.display_name, ROUND(r.rating) rating, ROUND(r.rd) rd, r.games
  FROM ratings r JOIN users u ON u.id = r.user_id ORDER BY r.category, r.rating DESC`).all();
console.log(`${apply ? 'APPLIED to' : 'dry run on copy of'} ${src}: ${games.length} games → ${rows.length} rating rows`);
console.table(rows);
