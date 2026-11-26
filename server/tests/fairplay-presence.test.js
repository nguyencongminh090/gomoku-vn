'use strict';

/**
 * fairplay-presence.test.js — #496 (features/presence-status §4, Q6 A): per-player away / disconnect summary of
 * rated games for staff review. Counters on the engine, one row per player at game end (migration 028, real SQL
 * on an in-memory DB), staff-only report (perm rating.integrity), 90-day prune. Never acts on a player.
 */

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() { return new Actual(':memory:'); };
});
jest.mock('../utils/logger', () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }));
const mockCan = { yes: new Set(['admin1']) };
jest.mock('../utils/roles', () => ({ can: (id, perm) => perm === 'rating.integrity' && mockCan.yes.has(id) }));

const database = require('../db/database');
const FP = require('../managers/FairPlayPresence');

const T0 = Date.parse('2026-11-27T12:00:00Z');
const S = 1000;

beforeAll(() => {
  const ins = database.db.prepare(`INSERT INTO users (id, username, password_hash, display_name, created_at) VALUES (?, ?, 'x', ?, ?)`);
  for (const id of ['a', 'b']) ins.run(id, id, id.toUpperCase(), '2026-11-01T00:00:00.000Z');
});
beforeEach(() => database.db.prepare('DELETE FROM game_presence').run());

function engine({ rated = true, gameId = 'g1' } = {}) {
  return {
    gameId, status: 'ongoing', currentTurn: 'a', isRated: () => rated,
    players: [{ userId: 'a', isGuest: false }, { userId: 'b', isGuest: false }],
    moveHistory: [{ timestamp: T0 }],
    fairPlay: { startedAt: T0, players: {} },
  };
}
const rows = () => database.db.prepare('SELECT * FROM game_presence ORDER BY user_id').all();

test('away on own turn, away on the opponent\'s turn, a drop: counted per player, one row each at game end', () => {
  const e = engine();
  FP.onPresence(e, 'a', 'away', T0 + 10 * S); // a's turn
  FP.onPresence(e, 'a', 'active', T0 + 40 * S); // 30 s away, all on own turn
  e.currentTurn = 'b';
  e.moveHistory.push({ timestamp: T0 + 50 * S });
  FP.onPresence(e, 'a', 'away', T0 + 60 * S); // b's turn
  FP.onPresence(e, 'a', 'active', T0 + 70 * S); // 10 s, not own turn
  FP.onDisconnect(e, 'b', T0 + 80 * S);
  FP.onReturn(e, 'b', T0 + 95 * S);
  e.status = 'finished';
  expect(FP.write(e, T0 + 100 * S)).toBe(2);
  const [a, b] = rows();
  expect(a).toMatchObject({ game_id: 'g1', user_id: 'a', away_count: 2, away_ms: 40 * S, away_ms_own_turn: 30 * S, longest_away_ms: 30 * S, disconnects: 0, game_ms: 100 * S });
  expect(b).toMatchObject({ user_id: 'b', disconnects: 1, disconnect_ms: 15 * S, away_count: 0 });
});

test('away stretch during which the turn reached the player counts as own turn only from the last move', () => {
  const e = engine();
  e.currentTurn = 'b';
  FP.onPresence(e, 'a', 'away', T0 + 10 * S);
  e.moveHistory.push({ timestamp: T0 + 25 * S }); // b moved; now a's turn
  e.currentTurn = 'a';
  FP.onPresence(e, 'a', 'active', T0 + 40 * S);
  FP.write(e, T0 + 50 * S);
  expect(rows()[0]).toMatchObject({ away_ms: 30 * S, away_ms_own_turn: 15 * S });
});

test('open stretches are closed at game end; a drop takes over from an away stretch', () => {
  const e = engine();
  FP.onPresence(e, 'a', 'away', T0 + 10 * S);
  FP.onDisconnect(e, 'a', T0 + 20 * S);
  FP.write(e, T0 + 50 * S);
  expect(rows()[0]).toMatchObject({ away_ms: 10 * S, disconnects: 1, disconnect_ms: 30 * S });
});

test('casual games and repeat reports record nothing', () => {
  const e = engine({ rated: false });
  FP.onPresence(e, 'a', 'away', T0);
  FP.onDisconnect(e, 'a', T0);
  expect(FP.write(e, T0 + S)).toBe(0);
  const r = engine();
  FP.onPresence(r, 'a', 'away', T0);
  FP.onPresence(r, 'a', 'away', T0 + 5 * S); // repeat: one stretch
  FP.write(r, T0 + 10 * S);
  expect(rows()[0].away_count).toBe(1);
});

test('staff report: admin only; players with >= 3 games and a signal, most own-turn away share first', () => {
  expect(() => FP.report('someone')).toThrow(expect.objectContaining({ code: 'CHEAT_FORBIDDEN', status: 403 }));
  for (let i = 0; i < 3; i++) {
    const e = engine({ gameId: 'r' + i });
    FP.onPresence(e, 'a', 'away', T0);
    FP.onPresence(e, 'a', 'active', T0 + 20 * S);
    FP.onDisconnect(e, 'b', T0);
    FP.onReturn(e, 'b', T0 + 5 * S);
    FP.write(e, T0 + 100 * S);
  }
  const r = FP.report('admin1');
  expect(r.minGames).toBe(3);
  expect(r.keepDays).toBe(90);
  expect(r.players.map((p) => [p.userId, p.games, p.ownTurnAwayShare])).toEqual([['a', 3, 0.2], ['b', 3, 0]]);
});

test('prune drops rows older than 90 days', () => {
  const e = engine({ gameId: 'old' });
  FP.write(e, T0 - 91 * 24 * 3600 * S);
  FP.write(engine({ gameId: 'new' }), T0);
  expect(FP.prune(T0)).toBe(2);
  expect(rows().map((r) => r.game_id)).toEqual(['new', 'new']);
});

test('a DB failure never throws into the game path', () => {
  const spy = jest.spyOn(database.db, 'prepare').mockImplementation(() => { throw new Error('SQLITE_BUSY'); });
  expect(FP.write(engine(), T0)).toBe(0);
  expect(FP.prune(T0)).toBe(0);
  spy.mockRestore();
});
