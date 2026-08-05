'use strict';

/**
 * TournamentManager.test.js — Unit tests for TournamentManager (Phase 1:
 * CRUD + registration only, no pairing/round generation — see
 * docs/instruction/B48-tournament-tables-tournaments-tu-yeu-cau-nguoi-dung.md).
 *
 * better-sqlite3 is mocked to an in-memory database (same technique as
 * save-game.test.js) so the real schema.sql and the real INSERT/UPDATE/DELETE
 * statements in database.js run for real — mocking database.js itself would
 * assert nothing about the persistence side of this manager.
 *
 * Fake timers (also matching save-game.test.js) — database.js starts a real
 * hourly WAL-checkpoint setInterval as a require-time side effect; without
 * faking timers that handle keeps the Jest worker alive after the run.
 */

jest.useFakeTimers();

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() {
    return new Actual(':memory:');
  };
});

jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const tournamentManager = require('../managers/tournament/TournamentManager');
const database = require('../db/database');
const config = require('../config');

let seq = 0;
/**
 * Fresh user each call, so registration-state from a prior test never leaks
 * in. Non-guest users are also inserted into the real `users` table —
 * tournaments.organizer_id / tournament_players.player_id are FK references
 * into `users(id)`, so a synthetic id that was never inserted would fail the
 * FK constraint the same way an un-inserted black_player_id does in
 * save-game.test.js.
 */
function user(overrides = {}) {
  seq++;
  const u = { userId: `u${seq}`, displayName: `User${seq}`, isGuest: false, ...overrides };
  database.createUser({
    id: u.userId,
    username: `user${seq}`,
    passwordHash: 'x',
    displayName: u.displayName,
    createdAt: new Date().toISOString(),
  });
  return u;
}
function guest(overrides = {}) {
  seq++;
  return { userId: `guest_${seq}`, displayName: `Khách${seq}`, isGuest: true, ...overrides };
}

beforeEach(() => {
  tournamentManager.tournaments.clear();
  tournamentManager.userTournamentMap.clear();
});

// ── Create ───────────────────────────────────────────────────────────────

describe('TournamentManager — createTournament', () => {
  test.each(config.TOURNAMENT_FORMATS)('creates a tournament with format=%s', (format) => {
    const organizer = user();
    const { tournament, error } = tournamentManager.createTournament(organizer, { format });
    expect(error).toBeUndefined();
    expect(tournament.format).toBe(format);
    expect(tournament.status).toBe('draft');
    expect(tournament.organizerId).toBe(organizer.userId);
    expect(tournament.entries.size).toBe(0);
  });

  test('rejects an invalid format', () => {
    const { tournament, error, code } = tournamentManager.createTournament(user(), { format: 'single_elim' });
    expect(tournament).toBeUndefined();
    expect(code).toBe('INVALID_FORMAT');
    expect(error).toBeTruthy();
  });

  test('rejects a missing format', () => {
    const { error, code } = tournamentManager.createTournament(user(), {});
    expect(code).toBe('INVALID_FORMAT');
    expect(error).toBeTruthy();
  });

  test('defaults name when omitted', () => {
    const organizer = user({ displayName: 'GrimLark' });
    const { tournament } = tournamentManager.createTournament(organizer, { format: 'swiss' });
    expect(tournament.name).toContain('GrimLark');
  });

  test('uses provided name, truncated to 60 chars', () => {
    const longName = 'A'.repeat(100);
    const { tournament } = tournamentManager.createTournament(user(), { format: 'swiss', name: longName });
    expect(tournament.name.length).toBe(60);
  });

  test('defaults ruleSet fields when omitted', () => {
    const { tournament } = tournamentManager.createTournament(user(), { format: 'round_robin' });
    expect(tournament.ruleSet).toEqual({
      boardSize: config.DEFAULT_BOARD_SIZE,
      winningRule: 'freestyle',
      ruleWall: false,
      rulePortal: false,
      ruleSwap2: false,
      timerMode: config.DEFAULT_TIMER_MODE,
      timerSeconds: config.DEFAULT_TIMER_SECONDS,
      timerIncrementSeconds: config.DEFAULT_TIMER_INCREMENT_SECONDS,
      schedulingWindowMs: config.DEFAULT_SCHEDULING_WINDOW_MS,
      tiebreakRule: config.DEFAULT_TIEBREAK_RULE,
    });
  });

  test('persists the tournament to SQLite (readable back via database.getTournamentById)', () => {
    const organizer = user();
    const { tournament } = tournamentManager.createTournament(organizer, { format: 'double_elim', name: 'Cúp mùa hè' });
    const row = database.getTournamentById(tournament.tournamentId);
    expect(row).toBeDefined();
    expect(row.name).toBe('Cúp mùa hè');
    expect(row.format).toBe('double_elim');
    expect(row.status).toBe('draft');
    expect(row.rule_set.boardSize).toBe(config.DEFAULT_BOARD_SIZE);
  });

  test('a guest organizer is persisted with a null organizer_id (FK-safe, mirrors games.*_player_id)', () => {
    const organizer = guest();
    const { tournament } = tournamentManager.createTournament(organizer, { format: 'swiss' });
    const row = database.getTournamentById(tournament.tournamentId);
    expect(row.organizer_id).toBeNull();
    // In-memory object still tracks the real (guest) id, for auth checks.
    expect(tournament.organizerId).toBe(organizer.userId);
  });

  // ── ruleSet boundary values ───────────────────────────────────────────
  test.each([
    [4, config.DEFAULT_TIMER_SECONDS],   // below min (5) → default
    [5, 5],                              // exact min → kept
    [3600, 3600],                        // exact max → kept
    [3601, config.DEFAULT_TIMER_SECONDS],// above max → default
  ])('timerSeconds=%i normalizes to %i', (input, expected) => {
    const { tournament } = tournamentManager.createTournament(user(), {
      format: 'swiss',
      ruleSet: { timerSeconds: input },
    });
    expect(tournament.ruleSet.timerSeconds).toBe(expected);
  });

  test('ruleSwap2=true forces ruleWall/rulePortal off even if both requested true', () => {
    const { tournament } = tournamentManager.createTournament(user(), {
      format: 'swiss',
      ruleSet: { ruleSwap2: true, ruleWall: true, rulePortal: true },
    });
    expect(tournament.ruleSet.ruleSwap2).toBe(true);
    expect(tournament.ruleSet.ruleWall).toBe(false);
    expect(tournament.ruleSet.rulePortal).toBe(false);
  });

  test('an unrecognized tiebreakRule falls back to the default rather than being accepted', () => {
    const { tournament } = tournamentManager.createTournament(user(), {
      format: 'swiss',
      ruleSet: { tiebreakRule: 'elo_delta' },
    });
    expect(tournament.ruleSet.tiebreakRule).toBe(config.DEFAULT_TIEBREAK_RULE);
  });
});

// ── Register / Unregister ───────────────────────────────────────────────

describe('TournamentManager — registerPlayer / unregisterPlayer', () => {
  function draftTournament(organizer = user()) {
    return tournamentManager.createTournament(organizer, { format: 'swiss' }).tournament;
  }

  test('registers a normal (non-guest) player', () => {
    const tournament = draftTournament();
    const player = user();
    const { entryId, error } = tournamentManager.registerPlayer(player, tournament.tournamentId);
    expect(error).toBeUndefined();
    expect(entryId).toBeTruthy();
    expect(tournament.entries.get(entryId).userId).toBe(player.userId);
  });

  test('registers a guest player (null player_id persisted, mirrors games.*_player_id)', () => {
    const tournament = draftTournament();
    const g = guest();
    const { entryId } = tournamentManager.registerPlayer(g, tournament.tournamentId);
    const rows = database.getTournamentPlayers(tournament.tournamentId);
    const row = rows.find(r => r.entry_id === entryId);
    expect(row.player_id).toBeNull();
    expect(row.display_name).toBe(g.displayName);
  });

  test('an organizer may also register as a player in their own tournament', () => {
    const organizer = user();
    const tournament = draftTournament(organizer);
    const { error, entryId } = tournamentManager.registerPlayer(organizer, tournament.tournamentId);
    expect(error).toBeUndefined();
    expect(tournament.entries.get(entryId).userId).toBe(organizer.userId);
  });

  test('registering for a non-existent tournament fails with TOURNAMENT_NOT_FOUND', () => {
    const { error, code } = tournamentManager.registerPlayer(user(), 'nonexistent-id');
    expect(code).toBe('TOURNAMENT_NOT_FOUND');
    expect(error).toBeTruthy();
  });

  test('double-registration (same user, same tournament) is rejected, not silently duplicated', () => {
    const tournament = draftTournament();
    const player = user();
    tournamentManager.registerPlayer(player, tournament.tournamentId);
    const second = tournamentManager.registerPlayer(player, tournament.tournamentId);
    expect(second.code).toBe('ALREADY_REGISTERED');
    expect(tournament.entries.size).toBe(1);
  });

  test('registration is rejected once the tournament is no longer draft', () => {
    const organizer = user();
    const tournament = draftTournament(organizer);
    tournamentManager.startTournament(organizer.userId, tournament.tournamentId);
    const { error, code } = tournamentManager.registerPlayer(user(), tournament.tournamentId);
    expect(code).toBe('TOURNAMENT_ALREADY_STARTED');
    expect(error).toBeTruthy();
  });

  test('unregisterPlayer removes a registered player before start', () => {
    const tournament = draftTournament();
    const player = user();
    const { entryId } = tournamentManager.registerPlayer(player, tournament.tournamentId);
    const { error } = tournamentManager.unregisterPlayer(player.userId, tournament.tournamentId);
    expect(error).toBeUndefined();
    expect(tournament.entries.has(entryId)).toBe(false);
    expect(database.getTournamentPlayers(tournament.tournamentId)).toHaveLength(0);
  });

  test('unregistering a never-registered user returns NOT_REGISTERED, does not throw', () => {
    const tournament = draftTournament();
    expect(() => {
      const { error, code } = tournamentManager.unregisterPlayer('never-registered', tournament.tournamentId);
      expect(code).toBe('NOT_REGISTERED');
      expect(error).toBeTruthy();
    }).not.toThrow();
  });

  test('unregistering from a non-existent tournament fails with TOURNAMENT_NOT_FOUND', () => {
    const { error, code } = tournamentManager.unregisterPlayer('u1', 'nonexistent-id');
    expect(code).toBe('TOURNAMENT_NOT_FOUND');
    expect(error).toBeTruthy();
  });

  test('unregistering is rejected once the tournament is no longer draft', () => {
    const organizer = user();
    const tournament = draftTournament(organizer);
    const player = user();
    tournamentManager.registerPlayer(player, tournament.tournamentId);
    tournamentManager.startTournament(organizer.userId, tournament.tournamentId);
    const { code } = tournamentManager.unregisterPlayer(player.userId, tournament.tournamentId);
    expect(code).toBe('TOURNAMENT_ALREADY_STARTED');
  });
});

// ── Concurrency (decision 6: unrestricted) ──────────────────────────────

describe('TournamentManager — concurrent registration (decision 6)', () => {
  test('the same user can register in two different tournaments simultaneously', () => {
    const player = user();
    const t1 = tournamentManager.createTournament(user(), { format: 'swiss' }).tournament;
    const t2 = tournamentManager.createTournament(user(), { format: 'round_robin' }).tournament;

    const r1 = tournamentManager.registerPlayer(player, t1.tournamentId);
    const r2 = tournamentManager.registerPlayer(player, t2.tournamentId);

    expect(r1.error).toBeUndefined();
    expect(r2.error).toBeUndefined();
    expect(tournamentManager.userTournamentMap.get(player.userId).size).toBe(2);
  });

  test('unregistering from one tournament does not affect the other', () => {
    const player = user();
    const t1 = tournamentManager.createTournament(user(), { format: 'swiss' }).tournament;
    const t2 = tournamentManager.createTournament(user(), { format: 'round_robin' }).tournament;
    tournamentManager.registerPlayer(player, t1.tournamentId);
    tournamentManager.registerPlayer(player, t2.tournamentId);

    tournamentManager.unregisterPlayer(player.userId, t1.tournamentId);

    expect(t1.entries.size).toBe(0);
    expect(t2.entries.size).toBe(1);
    expect(tournamentManager.userTournamentMap.get(player.userId)).toEqual(new Set([t2.tournamentId]));
  });

  test('unregistering from the last remaining tournament removes the userTournamentMap entry entirely', () => {
    const player = user();
    const t1 = tournamentManager.createTournament(user(), { format: 'swiss' }).tournament;
    tournamentManager.registerPlayer(player, t1.tournamentId);
    tournamentManager.unregisterPlayer(player.userId, t1.tournamentId);
    expect(tournamentManager.userTournamentMap.has(player.userId)).toBe(false);
  });
});

// ── startTournament (Phase 1 stub) ──────────────────────────────────────

describe('TournamentManager — startTournament (Phase 1 stub)', () => {
  test('organizer can start a tournament with 0 players without throwing', () => {
    const organizer = user();
    const tournament = tournamentManager.createTournament(organizer, { format: 'swiss' }).tournament;
    expect(() => {
      const { tournament: started, error } = tournamentManager.startTournament(organizer.userId, tournament.tournamentId);
      expect(error).toBeUndefined();
      expect(started.status).toBe('active');
      expect(started.startedAt).toBeTruthy();
    }).not.toThrow();
  });

  test('a non-organizer cannot start the tournament', () => {
    const organizer = user();
    const tournament = tournamentManager.createTournament(organizer, { format: 'swiss' }).tournament;
    const intruder = user();
    const { error, code } = tournamentManager.startTournament(intruder.userId, tournament.tournamentId);
    expect(code).toBe('ORGANIZER_ONLY');
    expect(error).toBeTruthy();
    expect(tournament.status).toBe('draft');
  });

  test('starting an already-active tournament is rejected (no double-start)', () => {
    const organizer = user();
    const tournament = tournamentManager.createTournament(organizer, { format: 'swiss' }).tournament;
    tournamentManager.startTournament(organizer.userId, tournament.tournamentId);
    const { code } = tournamentManager.startTournament(organizer.userId, tournament.tournamentId);
    expect(code).toBe('TOURNAMENT_ALREADY_STARTED');
  });

  test('starting a non-existent tournament fails with TOURNAMENT_NOT_FOUND', () => {
    const { error, code } = tournamentManager.startTournament('u1', 'nonexistent-id');
    expect(code).toBe('TOURNAMENT_NOT_FOUND');
    expect(error).toBeTruthy();
  });

  test('status flip is persisted to SQLite', () => {
    const organizer = user();
    const tournament = tournamentManager.createTournament(organizer, { format: 'swiss' }).tournament;
    tournamentManager.startTournament(organizer.userId, tournament.tournamentId);
    const row = database.getTournamentById(tournament.tournamentId);
    expect(row.status).toBe('active');
    expect(row.started_at).toBeTruthy();
  });

  test("emits 'tournament_started' with the tournamentId", () => {
    const organizer = user();
    const tournament = tournamentManager.createTournament(organizer, { format: 'swiss' }).tournament;
    const listener = jest.fn();
    tournamentManager.once('tournament_started', listener);
    tournamentManager.startTournament(organizer.userId, tournament.tournamentId);
    expect(listener).toHaveBeenCalledWith(tournament.tournamentId);
  });
});

// ── List / Serialize ─────────────────────────────────────────────────────

describe('TournamentManager — listTournaments / serialization', () => {
  test('listTournaments reflects player counts as players register', () => {
    const tournament = tournamentManager.createTournament(user(), { format: 'swiss', name: 'T1' }).tournament;
    tournamentManager.registerPlayer(user(), tournament.tournamentId);
    tournamentManager.registerPlayer(user(), tournament.tournamentId);

    const summary = tournamentManager.listTournaments().find(t => t.tournamentId === tournament.tournamentId);
    expect(summary.playerCount).toBe(2);
    expect(summary.name).toBe('T1');
    expect(summary.status).toBe('draft');
  });

  test('serializeTournament includes ruleSet and full entry list', () => {
    const tournament = tournamentManager.createTournament(user(), { format: 'swiss' }).tournament;
    const player = user();
    tournamentManager.registerPlayer(player, tournament.tournamentId);

    const payload = tournamentManager.serializeTournament(tournament);
    expect(payload.ruleSet).toBeDefined();
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0].userId).toBe(player.userId);
  });

  test('serializeTournamentUpdate omits ruleSet', () => {
    const tournament = tournamentManager.createTournament(user(), { format: 'swiss' }).tournament;
    const payload = tournamentManager.serializeTournamentUpdate(tournament);
    expect(payload.ruleSet).toBeUndefined();
    expect(payload.tournamentId).toBe(tournament.tournamentId);
  });
});
