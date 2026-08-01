'use strict';

/**
 * save-game.test.js — Unit tests for persisting a finished game.
 *
 * Restores the checks that were run and discarded when backend fixes #2 and #3
 * were made (see docs/fix-log.md). The verification pass showed both fixes
 * could be deleted with the whole suite still green.
 *
 * #2 — a guest player's id must never be written into black_player_id /
 *      white_player_id. Those columns are foreign keys into `users`, and a
 *      guest has no row there, so writing one rolls the whole transaction back
 *      under `foreign_keys = ON` and the registered opponent's game is lost too.
 * #3 — a game cancelled with `{noScore: true}` must not be persisted at all.
 *
 * better-sqlite3 is mocked to an in-memory database so the real schema and the
 * real INSERT run, with foreign key enforcement on — mocking the database
 * module would assert nothing about either fix.
 */

jest.useFakeTimers();

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() {
    return new Actual(':memory:');
  };
});

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const database = require('../db/database');

const REGISTERED = { id: 'user-registered', name: 'Alice', color: 'BLACK', isGuest: false };
const GUEST      = { id: 'guest_ab12cd34',  name: 'Khách',  color: 'WHITE', isGuest: true  };

function gameFixture(overrides = {}) {
  return {
    gameId: 'game-' + Math.random().toString(36).slice(2, 10),
    roomId: '#A1B',
    players: [REGISTERED, GUEST],
    result: { winner: REGISTERED.id, reason: 'normal' },
    boardSize: 17,
    ruleWall: true,
    rulePortal: false,
    moveHistory: [{ x: 8, y: 8, color: 'BLACK', timestamp: Date.now() }],
    walls: [],
    portals: [],
    startedAt: new Date(1700000000000).toISOString(),
    endedAt: new Date(1700000060000).toISOString(),
    ...overrides,
  };
}

beforeAll(() => {
  database.db.prepare(
    `INSERT INTO users (id, username, password_hash, display_name, created_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(REGISTERED.id, 'alice', 'hash', 'Alice', Date.now());
});

function rowFor(gameId) {
  return database.db.prepare('SELECT * FROM games WHERE id = ?').get(gameId);
}

describe('saveGame — a guest playing a registered user (backend fix #2)', () => {
  test('foreign keys are actually enforced, so this test can fail', () => {
    // Without this the whole scenario would pass for the wrong reason.
    expect(database.db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  test('the game is persisted, not silently rolled back', () => {
    const game = gameFixture();

    database.saveGame(game);

    expect(rowFor(game.gameId)).toBeDefined();
  });

  test("the guest's id is stored as NULL, and the registered player's is kept", () => {
    const game = gameFixture();
    database.saveGame(game);

    const row = rowFor(game.gameId);
    expect(row.white_player_id).toBeNull();          // the guest
    expect(row.black_player_id).toBe(REGISTERED.id); // the registered player
    // Names survive for both, which is what the history screen renders.
    expect(row.black_player_name).toBe('Alice');
    expect(row.white_player_name).toBe('Khách');
  });

  test('a guest id passed with isGuest wrongly set to false would break the write', () => {
    // Demonstrates the exact failure fix #2 removed: with isGuest hardcoded
    // false (the old behaviour), the guest's id hits the FK and the whole
    // transaction — including the registered opponent's row — is lost.
    const game = gameFixture({
      players: [REGISTERED, { ...GUEST, isGuest: false }],
    });

    expect(() => database.saveGame(game)).toThrow();
    expect(rowFor(game.gameId)).toBeUndefined();
  });

  test('only the registered player is linked in player_games', () => {
    const game = gameFixture();
    database.saveGame(game);

    const links = database.db
      .prepare('SELECT player_id FROM player_games WHERE game_id = ?')
      .all(game.gameId)
      .map(r => r.player_id);

    expect(links).toEqual([REGISTERED.id]);
  });

  test('a guest-versus-guest game still persists, with both ids null', () => {
    const game = gameFixture({
      players: [
        { id: 'guest_1111', name: 'Khách 1', color: 'BLACK', isGuest: true },
        { id: 'guest_2222', name: 'Khách 2', color: 'WHITE', isGuest: true },
      ],
      result: { winner: 'guest_1111', reason: 'normal' },
    });

    database.saveGame(game);

    const row = rowFor(game.gameId);
    expect(row).toBeDefined();
    expect(row.black_player_id).toBeNull();
    expect(row.white_player_id).toBeNull();
    // Winner is stored as a seat colour so a guest winner stays resolvable.
    expect(row.winner).toBe('BLACK');
  });
});

describe('isGuest threading (backend fix #2)', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'socket', 'handlers', 'GameHandler.js'), 'utf8'
  );

  test('saveGame is handed each player\'s real isGuest, not a false literal', () => {
    // The original bug: `isGuest: false` was hardcoded here, so the guard in
    // database.js never triggered for guests.
    expect(source).toMatch(/isGuest:\s*p\.isGuest/);
    expect(source).not.toMatch(/isGuest:\s*false/);
  });

  test('the flag reaches GameEngine from the room\'s own user entries', () => {
    // room.users has carried a real isGuest all along; it just never got
    // through to engine.players.
    expect(source).toMatch(/isGuest:\s*\w*[Pp]layer\.isGuest/);
  });
});

describe('handleGameEnd persistence guard (backend fix #3)', () => {
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.join(__dirname, '..', 'socket', 'handlers', 'GameHandler.js'), 'utf8'
  );

  test('the database write is gated on !noScore, like the score update above it', () => {
    // A disconnect-cancelled game (both players gone) calls handleGameEnd with
    // {noScore: true}. The score block always checked it; the persist block
    // below it did not, so every double-disconnect still wrote a full row with
    // its move history.
    const persistBlock = source.slice(source.indexOf('// Persist game to SQLite'));
    const condition = persistBlock.slice(0, persistBlock.indexOf('{'));

    expect(condition).toContain('!noScore');
    expect(condition).toContain('engine.result');
  });

  test('the only caller passing noScore is the both-players-gone grace expiry', () => {
    const disconnectSrc = fs.readFileSync(
      path.join(__dirname, '..', 'socket', 'handlers', 'DisconnectHandler.js'), 'utf8'
    );
    expect(disconnectSrc).toContain('noScore: true');
  });
});
