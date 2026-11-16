'use strict';

// B344-B347 (migrations 010-014): role is the only admin column, tournament JSON owner + json_valid, reference FKs,
// enum/bool CHECKs. Fresh temp DB replays every migration; each case asserts the bad write is refused.
const fs = require('fs');
const os = require('os');
const path = require('path');

jest.mock('../utils/logger', () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'b344-'));
let db;
let tournaments;

const T = '2026-10-23T00:00:00.000Z';
const cols = (t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
const run = (sql, ...p) => db.prepare(sql).run(...p);
const user = (id, extra = {}) => {
  const row = { id, username: id, password_hash: 'x', display_name: id, created_at: T, ...extra };
  const k = Object.keys(row);
  run(`INSERT INTO users (${k.join(', ')}) VALUES (${k.map(() => '?').join(', ')})`, ...Object.values(row));
};

beforeAll(() => {
  process.env.GOMOKU_DB_PATH = path.join(tmp, 'c.db');
  jest.isolateModules(() => {
    ({ db } = require('../db/connection'));
    tournaments = require('../db/tournaments');
  });
  user('u1'); user('u2');
  run("INSERT INTO tournaments (id, name, format, rule_set, status, created_at) VALUES ('t1', 'T', 'swiss', '{}', 'draft', ?)", T);
  run("INSERT INTO tournament_rounds (id, tournament_id, round_index) VALUES ('r1', 't1', 0)");
  run("INSERT INTO tournament_players (entry_id, tournament_id, player_id, display_name, registered_at) VALUES ('e1', 't1', 'u1', 'a', ?)", T);
});
afterAll(() => { db.close(); delete process.env.GOMOKU_DB_PATH; fs.rmSync(tmp, { recursive: true, force: true }); });

describe('B344 users.role is the single admin source', () => {
  test('is_admin column is gone; role stays', () => {
    expect(cols('users')).not.toContain('is_admin');
    expect(cols('users')).toContain('role');
  });
  test('no server code reads or writes is_admin outside the frozen baseline upgrade', () => {
    const hits = [];
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (!['tests', 'node_modules', 'migrations'].includes(e.name)) walk(p); }
      else if (e.name.endsWith('.js') && e.name !== 'legacy-upgrade.js' && fs.readFileSync(p, 'utf8').includes('is_admin')) hits.push(p);
    });
    walk(path.join(__dirname, '..'));
    expect(hits).toEqual([]);
  });
  test('promote/demote keeps one value; unknown role is refused', () => {
    run("UPDATE users SET role = 'admin' WHERE id = 'u2'");
    run("UPDATE users SET role = 'member' WHERE id = 'u2'");
    expect(db.prepare("SELECT role FROM users WHERE id = 'u2'").get().role).toBe('member');
    expect(() => run("UPDATE users SET role = 'owner' WHERE id = 'u2'")).toThrow(/CHECK/);
  });
  test('idx_users_oauth is UNIQUE again after the rebuild', () => {
    expect(db.prepare("SELECT sql FROM sqlite_master WHERE name = 'idx_users_oauth'").get().sql).toMatch(/UNIQUE/);
  });
});

describe('B345 tournament JSON owner + json_valid', () => {
  const pairing = (over = {}) => ({
    pairingId: 'p1', roundId: 'r1', tournamentId: 't1', player1EntryId: 'e1', player2EntryId: null, state: 'Paired',
    agreedTime: null, deadline: T, pairedAt: T, result: null, games: [], moves: [{ x: 1, y: 1 }], startedAt: null, endedAt: null, ...over,
  });
  test('tournament_pairings has no moves column; savePairing ignores pairing.moves', () => {
    expect(cols('tournament_pairings')).not.toContain('moves');
    tournaments.savePairing(pairing());
    const row = tournaments.getPairingsByTournament('t1').find((p) => p.id === 'p1');
    expect(row.games).toEqual([]);
    expect(row.moves).toBeUndefined();
  });
  test.each([
    ['tournament_pairings.result', "UPDATE tournament_pairings SET result = '{x' WHERE id = 'p1'"],
    ['tournament_pairings.games', "UPDATE tournament_pairings SET games = 'nope' WHERE id = 'p1'"],
    ['tournaments.rule_set', "UPDATE tournaments SET rule_set = '{' WHERE id = 't1'"],
    ['puzzles.stones', "INSERT INTO puzzles (id, author_id, title, rule, board_size, stones, to_move, mode, answers, level, position_hash, created_at, updated_at) VALUES ('z1','u1','t','freestyle',15,'[','BLACK','sequence','[]','easy','h','t','t')"],
    ['puzzles.answers', "INSERT INTO puzzles (id, author_id, title, rule, board_size, stones, to_move, mode, answers, level, position_hash, created_at, updated_at) VALUES ('z2','u1','t','freestyle',15,'[]','BLACK','sequence','{','easy','h','t','t')"],
    ['puzzles.layout', "INSERT INTO puzzles (id, author_id, title, rule, board_size, stones, layout, to_move, mode, answers, level, position_hash, created_at, updated_at) VALUES ('z3','u1','t','freestyle',15,'[]','x','BLACK','sequence','[]','easy','h','t','t')"],
  ])('malformed JSON in %s is rejected', (_c, sql) => {
    expect(() => run(sql)).toThrow(/CHECK/);
  });
  test.each(['moves', 'walls', 'portals'])('tournament_games.%s rejects malformed JSON, accepts NULL', (col) => {
    const ins = (id, v) => run(`INSERT INTO tournament_games (id, tournament_id, pairing_id, game_index, black_player_name, white_player_name,
      board_size, started_at, ${col}) VALUES (?, 't1', 'p1', 0, 'a', 'b', 15, ?, ?)`, id, T, v);
    expect(() => ins(`g-${col}-bad`, '[{')).toThrow(/CHECK/);
    expect(() => ins(`g-${col}-null`, null)).not.toThrow();
  });
});

describe('B346 reference FKs', () => {
  test.each([
    ['notifications.actor_id', "INSERT INTO notifications (user_id, type, actor_id, created_at) VALUES ('u1', 'dm', 'ghost', 't')"],
    ['rating_history.opponent_id', "INSERT INTO rating_history (user_id, category, game_id, opponent_id, score, rating_before, rating_after, rd_before, rd_after, created_at) VALUES ('u1','freestyle','g','ghost',1,1,1,1,1,'t')"],
  ])('%s refuses an unknown user', (_c, sql) => {
    expect(() => run(sql)).toThrow(/FOREIGN KEY/);
  });
  test('elo_swaps winner/loser reference users and must be the swap pair', () => {
    const fk = db.prepare('PRAGMA foreign_key_list(elo_swaps)').all().filter((r) => r.table === 'users').map((r) => r.from).sort();
    expect(fk).toEqual(['loser_id', 'user_hi', 'user_lo', 'winner_id']);
    user('u3');
    expect(() => run("INSERT INTO elo_swaps (category, user_lo, user_hi, winner_id, loser_id, winner_before, winner_after, loser_before, loser_after, game_ids, created_at) VALUES ('freestyle','u1','u2','u3','u2',1,1,1,1,'[]','t')")).toThrow(/CHECK/);
    expect(() => run("INSERT INTO elo_swaps (category, user_lo, user_hi, winner_id, loser_id, winner_before, winner_after, loser_before, loser_after, game_ids, created_at) VALUES ('freestyle','u1','u2','u1','u2',1,1,1,1,'[]','t')")).not.toThrow();
  });
  test('rating_history.game_id stays unconstrained (series may rate an unsaved game); NULL actor allowed', () => {
    expect(() => run("INSERT INTO rating_history (user_id, category, game_id, opponent_id, score, rating_before, rating_after, rd_before, rd_after, created_at) VALUES ('u1','freestyle','no-such-game','u2',1,1,1,1,1,'t')")).not.toThrow();
    expect(() => run("INSERT INTO notifications (user_id, type, actor_id, created_at) VALUES ('u1', 'dm', NULL, 't')")).not.toThrow();
  });
  test('admin_edges / game_reports / news stay FK-free by design', () => {
    for (const t of ['admin_edges', 'game_reports', 'news']) expect(db.prepare(`PRAGMA foreign_key_list(${t})`).all()).toEqual([]);
  });
});

describe('B347 enum and 0/1 CHECKs', () => {
  test.each([
    ['users.who_can_dm', "UPDATE users SET who_can_dm = 'all' WHERE id = 'u1'"],
    ['users.who_can_challenge', "UPDATE users SET who_can_challenge = '' WHERE id = 'u1'"],
    ['users.who_can_friend', "UPDATE users SET who_can_friend = 'Friends' WHERE id = 'u1'"],
    ['users.hide_history', "UPDATE users SET hide_history = 2 WHERE id = 'u1'"],
    ['users.hide_bio', "UPDATE users SET hide_bio = -1 WHERE id = 'u1'"],
    ['users.hide_online', "UPDATE users SET hide_online = 'yes' WHERE id = 'u1'"],
    ['clubs.join_policy', "INSERT INTO clubs (id, slug, name, join_policy, owner_id, created_at) VALUES ('c1', 'c1', 'C', 'closed', 'u1', 't')"],
    ['tournaments.status', "UPDATE tournaments SET status = 'paused' WHERE id = 't1'"],
    ['tournaments.format', "UPDATE tournaments SET format = 'knockout' WHERE id = 't1'"],
    ['tournament_pairings.state', "UPDATE tournament_pairings SET state = 'Done' WHERE id = 'p1'"],
    ['tournament_players.withdrawn', "UPDATE tournament_players SET withdrawn = 2 WHERE entry_id = 'e1'"],
    ['puzzles.status', "INSERT INTO puzzles (id, author_id, title, rule, board_size, stones, to_move, mode, answers, level, status, position_hash, created_at, updated_at) VALUES ('z4','u1','t','freestyle',15,'[]','BLACK','sequence','[]','easy','live','h','t','t')"],
    ['puzzles.mode', "INSERT INTO puzzles (id, author_id, title, rule, board_size, stones, to_move, mode, answers, level, position_hash, created_at, updated_at) VALUES ('z5','u1','t','freestyle',15,'[]','BLACK','final','[]','easy','h','t','t')"],
    ['puzzles.level', "INSERT INTO puzzles (id, author_id, title, rule, board_size, stones, to_move, mode, answers, level, position_hash, created_at, updated_at) VALUES ('z6','u1','t','freestyle',15,'[]','BLACK','sequence','[]','insane','h','t','t')"],
    ['ratings.category', "INSERT INTO ratings (user_id, category, rating, rd, volatility, updated_at) VALUES ('u1', 'renju', 1500, 350, 0.06, 't')"],
    ['forum_reports.target_type', "INSERT INTO forum_reports (id, target_type, target_id, thread_id, reporter_id, reason, created_at) VALUES ('f1', 'user', 'x', 'x', 'u1', 'r', 't')"],
    ['forum_threads.deleted', "INSERT INTO forum_threads (id, category, author_id, title, body, created_at, last_post_at, deleted) VALUES ('th1', 'general', 'u1', 't', 'b', 't', 't', 3)"],
    ['sessions.is_guest', "INSERT INTO sessions (id, user_id, display_name, is_guest, created_at, last_seen_at, expires_at) VALUES ('s1', 'u1', 'a', 2, 't', 't', 't')"],
  ])('invalid %s is rejected', (_c, sql) => {
    expect(() => run(sql)).toThrow(/CHECK/);
  });
  test('every allowed value is accepted', () => {
    for (const v of ['everyone', 'friends', 'nobody']) run('UPDATE users SET who_can_dm = ?, who_can_challenge = ?, who_can_friend = ? WHERE id = ?', v, v, v, 'u1');
    for (const v of ['member', 'moderator', 'admin']) run("UPDATE users SET role = ? WHERE id = 'u1'", v);
    for (const v of ['draft', 'active', 'completed', 'cancelled']) run("UPDATE tournaments SET status = ? WHERE id = 't1'", v);
    for (const v of ['swiss', 'round_robin', 'double_elim']) run("UPDATE tournaments SET format = ? WHERE id = 't1'", v);
    for (const v of ['Paired', 'Negotiating', 'Reported', 'Ready', 'InProgress', 'Completed', 'Walkover', 'DoubleNoShow', 'OrganizerAdjusted', 'Cancelled']) {
      run("UPDATE tournament_pairings SET state = ? WHERE id = 'p1'", v);
    }
    for (const v of ['freestyle', 'standard', 'caro']) run("INSERT INTO ratings (user_id, category, rating, rd, volatility, updated_at) VALUES ('u2', ?, 1500, 350, 0.06, 't')", v);
    run("INSERT INTO clubs (id, slug, name, join_policy, owner_id, created_at) VALUES ('c2', 'c2', 'C', 'invite', 'u1', 't')");
  });
  test('foreign_key_check is clean after the rebuilds', () => {
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
});
