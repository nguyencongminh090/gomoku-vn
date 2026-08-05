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
const tournamentState = require('../socket/tournamentState');
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

  test('listTournaments includes organizerName and entryUserIds — the client-side lobby has no other way to show "you organize this"/"you\'re registered" without one round-trip per card', () => {
    const organizer = user({ displayName: 'GrimLark' });
    const tournament = tournamentManager.createTournament(organizer, { format: 'swiss' }).tournament;
    const player = user({ displayName: 'SlimFish' });
    tournamentManager.registerPlayer(player, tournament.tournamentId);

    const summary = tournamentManager.listTournaments().find(t => t.tournamentId === tournament.tournamentId);
    expect(summary.organizerName).toBe('GrimLark');
    expect(summary.entryUserIds).toEqual([player.userId]);
  });

  test('serializeTournament includes ruleSet, organizerName, and full entry list', () => {
    const organizer = user({ displayName: 'GrimLark' });
    const tournament = tournamentManager.createTournament(organizer, { format: 'swiss' }).tournament;
    const player = user();
    tournamentManager.registerPlayer(player, tournament.tournamentId);

    const payload = tournamentManager.serializeTournament(tournament);
    expect(payload.ruleSet).toBeDefined();
    expect(payload.organizerName).toBe('GrimLark');
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

// ── Phase 3: pairing lifecycle integration ──────────────────────────────
// TournamentManager.startTournament() now generates real round-1 pairings
// via the Phase 2 format engines; these tests cover the integration glue
// (wrapper auth resolution, DB persistence, round/bracket advancement,
// TimerManager lifecycle, deadline-sweep-driven walkover/void-replay) —
// PairingLifecycle.test.js already covers per-transition correctness
// exhaustively, so these stay focused on what only TournamentManager adds.

/** Advance a real (non-bye) pairing from Negotiating to Ready via report+confirm. */
function advanceToReady(tournamentId, pairingId, reporterUserId, confirmerUserId, time = '2026-09-01T10:00:00Z') {
  tournamentManager.reportPairingTime(reporterUserId, tournamentId, pairingId, time);
  tournamentManager.confirmPairingTime(confirmerUserId, tournamentId, pairingId);
}

describe('TournamentManager — startTournament generates real round-1 pairings', () => {
  test('swiss, 4 players: 2 real pairings, no bye', () => {
    const organizer = user();
    const tournament = tournamentManager.createTournament(organizer, { format: 'swiss' }).tournament;
    const players = [user(), user(), user(), user()];
    for (const p of players) tournamentManager.registerPlayer(p, tournament.tournamentId);
    tournamentManager.startTournament(organizer.userId, tournament.tournamentId);

    const pairings = tournamentManager.listPairings(tournament.tournamentId);
    expect(pairings).toHaveLength(2);
    expect(pairings.every((p) => p.state === 'Negotiating')).toBe(true);
    expect(pairings.every((p) => p.player2EntryId !== null)).toBe(true);
  });

  test('round_robin, 3 players: 1 real pairing + 1 bye (already Completed)', () => {
    const organizer = user();
    const tournament = tournamentManager.createTournament(organizer, { format: 'round_robin' }).tournament;
    const players = [user(), user(), user()];
    for (const p of players) tournamentManager.registerPlayer(p, tournament.tournamentId);
    tournamentManager.startTournament(organizer.userId, tournament.tournamentId);

    const pairings = tournamentManager.listPairings(tournament.tournamentId);
    expect(pairings).toHaveLength(2);
    const byes = pairings.filter((p) => p.player2EntryId === null);
    const real = pairings.filter((p) => p.player2EntryId !== null);
    expect(byes).toHaveLength(1);
    expect(byes[0].state).toBe('Completed');
    expect(real).toHaveLength(1);
    expect(real[0].state).toBe('Negotiating');
  });

  test('double_elim, 4 players: 2 real winners-round-1 pairings', () => {
    const organizer = user();
    const tournament = tournamentManager.createTournament(organizer, { format: 'double_elim' }).tournament;
    const players = [user(), user(), user(), user()];
    for (const p of players) tournamentManager.registerPlayer(p, tournament.tournamentId);
    tournamentManager.startTournament(organizer.userId, tournament.tournamentId);

    const pairings = tournamentManager.listPairings(tournament.tournamentId);
    expect(pairings).toHaveLength(2);
    expect(pairings.map((p) => p.bracketMatchId).sort()).toEqual(['W1M1', 'W1M2']);
    expect(pairings.every((p) => p.state === 'Negotiating')).toBe(true);
  });

  test('double_elim, 5 players (padded to 8): byes for the top 3 seeds are auto-Completed', () => {
    const organizer = user();
    const tournament = tournamentManager.createTournament(organizer, { format: 'double_elim' }).tournament;
    const players = [user(), user(), user(), user(), user()];
    for (const p of players) tournamentManager.registerPlayer(p, tournament.tournamentId);
    tournamentManager.startTournament(organizer.userId, tournament.tournamentId);

    const pairings = tournamentManager.listPairings(tournament.tournamentId);
    const byes = pairings.filter((p) => p.player2EntryId === null);
    expect(byes).toHaveLength(3);
    expect(byes.every((p) => p.state === 'Completed')).toBe(true);
  });
});

describe('TournamentManager — pairing wrappers resolve identity correctly', () => {
  test('reportPairingTime rejects a user who never registered for this tournament', () => {
    const organizer = user();
    const tournament = tournamentManager.createTournament(organizer, { format: 'swiss' }).tournament;
    const p1 = user(); const p2 = user();
    tournamentManager.registerPlayer(p1, tournament.tournamentId);
    tournamentManager.registerPlayer(p2, tournament.tournamentId);
    tournamentManager.startTournament(organizer.userId, tournament.tournamentId);
    const [pairing] = tournamentManager.listPairings(tournament.tournamentId);

    const stranger = user();
    const { error, code } = tournamentManager.reportPairingTime(stranger.userId, tournament.tournamentId, pairing.pairingId, 'x');
    expect(code).toBe('NOT_A_PARTICIPANT');
    expect(error).toBeTruthy();
  });

  test('organizerAdjustPairing rejects a non-organizer, even if they are a registered player', () => {
    const organizer = user();
    const tournament = tournamentManager.createTournament(organizer, { format: 'swiss' }).tournament;
    const p1 = user(); const p2 = user();
    tournamentManager.registerPlayer(p1, tournament.tournamentId);
    tournamentManager.registerPlayer(p2, tournament.tournamentId);
    tournamentManager.startTournament(organizer.userId, tournament.tournamentId);
    const [pairing] = tournamentManager.listPairings(tournament.tournamentId);

    const { code } = tournamentManager.organizerAdjustPairing(p1.userId, tournament.tournamentId, pairing.pairingId, 'x');
    expect(code).toBe('ORGANIZER_ONLY');
  });

  test('operations against an unknown pairingId fail with PAIRING_NOT_FOUND, not a throw', () => {
    const organizer = user();
    const tournament = tournamentManager.createTournament(organizer, { format: 'swiss' }).tournament;
    expect(() => {
      const { code } = tournamentManager.reportPairingTime(organizer.userId, tournament.tournamentId, 'nonexistent', 'x');
      expect(code).toBe('PAIRING_NOT_FOUND');
    }).not.toThrow();
  });
});

describe('TournamentManager — markPairingReady creates/tears down a TimerManager', () => {
  test('both players ready: a timer is created in tournamentState.tournamentTimerMap and started', () => {
    const organizer = user();
    const tournament = tournamentManager.createTournament(organizer, { format: 'swiss' }).tournament;
    const p1 = user(); const p2 = user();
    tournamentManager.registerPlayer(p1, tournament.tournamentId);
    tournamentManager.registerPlayer(p2, tournament.tournamentId);
    tournamentManager.startTournament(organizer.userId, tournament.tournamentId);
    const [pairing] = tournamentManager.listPairings(tournament.tournamentId);

    advanceToReady(tournament.tournamentId, pairing.pairingId, p1.userId, p2.userId);
    tournamentManager.markPairingReady(p1.userId, tournament.tournamentId, pairing.pairingId);
    expect(tournamentState.tournamentTimerMap.has(pairing.pairingId)).toBe(false); // only 1 of 2 ready
    const { bothReady } = tournamentManager.markPairingReady(p2.userId, tournament.tournamentId, pairing.pairingId);

    expect(bothReady).toBe(true);
    expect(tournamentState.tournamentTimerMap.has(pairing.pairingId)).toBe(true);
    expect(tournamentState.pendingDeadlines.has(pairing.pairingId)).toBe(false); // untracked once InProgress
    expect(tournamentManager.getPairing(pairing.pairingId).state).toBe('InProgress');
  });

  test('recordPairingResult tears down the timer (no leaked interval)', () => {
    const organizer = user();
    const tournament = tournamentManager.createTournament(organizer, { format: 'swiss' }).tournament;
    const p1 = user(); const p2 = user();
    const { entryId: e1 } = tournamentManager.registerPlayer(p1, tournament.tournamentId);
    tournamentManager.registerPlayer(p2, tournament.tournamentId);
    tournamentManager.startTournament(organizer.userId, tournament.tournamentId);
    const [pairing] = tournamentManager.listPairings(tournament.tournamentId);

    advanceToReady(tournament.tournamentId, pairing.pairingId, p1.userId, p2.userId);
    tournamentManager.markPairingReady(p1.userId, tournament.tournamentId, pairing.pairingId);
    tournamentManager.markPairingReady(p2.userId, tournament.tournamentId, pairing.pairingId);
    expect(tournamentState.tournamentTimerMap.has(pairing.pairingId)).toBe(true);

    tournamentManager.recordPairingResult(tournament.tournamentId, pairing.pairingId, e1);
    expect(tournamentState.tournamentTimerMap.has(pairing.pairingId)).toBe(false);
  });
});

describe('TournamentManager — round advancement (Swiss, 2 players -> 1 round)', () => {
  test('completing the only round completes the tournament and assigns final ranks', () => {
    const organizer = user();
    const tournament = tournamentManager.createTournament(organizer, { format: 'swiss' }).tournament;
    const p1 = user(); const p2 = user();
    const { entryId: e1 } = tournamentManager.registerPlayer(p1, tournament.tournamentId);
    const { entryId: e2 } = tournamentManager.registerPlayer(p2, tournament.tournamentId);
    tournamentManager.startTournament(organizer.userId, tournament.tournamentId);
    const [pairing] = tournamentManager.listPairings(tournament.tournamentId);

    advanceToReady(tournament.tournamentId, pairing.pairingId, p1.userId, p2.userId);
    tournamentManager.markPairingReady(p1.userId, tournament.tournamentId, pairing.pairingId);
    tournamentManager.markPairingReady(p2.userId, tournament.tournamentId, pairing.pairingId);
    tournamentManager.recordPairingResult(tournament.tournamentId, pairing.pairingId, e1);

    expect(tournament.status).toBe('completed');
    expect(tournament.entries.get(e1).finalRank).toBe(1);
    expect(tournament.entries.get(e2).finalRank).toBe(2);
  });
});

describe('TournamentManager — round advancement (Round robin, 3 players -> 3 rounds)', () => {
  test('a full round-robin schedule plays out and completes with 2 real games total', () => {
    const organizer = user();
    const tournament = tournamentManager.createTournament(organizer, { format: 'round_robin' }).tournament;
    const p1 = user(); const p2 = user(); const p3 = user();
    const { entryId: e1 } = tournamentManager.registerPlayer(p1, tournament.tournamentId);
    tournamentManager.registerPlayer(p2, tournament.tournamentId);
    tournamentManager.registerPlayer(p3, tournament.tournamentId);
    tournamentManager.startTournament(organizer.userId, tournament.tournamentId);

    const userById = { [e1]: p1 };
    // Play out real matches round by round until the tournament completes.
    // (3 players -> 3 rounds, 1 real match per round, 1 bye per round.)
    let guard = 0;
    while (tournament.status === 'active' && guard < 10) {
      guard++;
      const real = tournamentManager.listPairings(tournament.tournamentId)
        .find((p) => p.player2EntryId !== null && p.state !== 'Completed');
      if (!real) break;
      const entryToUser = (entryId) => [p1, p2, p3].find((u) => {
        const found = Array.from(tournament.entries.values()).find((e) => e.entryId === entryId);
        return found && found.userId === u.userId;
      });
      const u1 = entryToUser(real.player1EntryId);
      const u2 = entryToUser(real.player2EntryId);
      advanceToReady(tournament.tournamentId, real.pairingId, u1.userId, u2.userId);
      tournamentManager.markPairingReady(u1.userId, tournament.tournamentId, real.pairingId);
      tournamentManager.markPairingReady(u2.userId, tournament.tournamentId, real.pairingId);
      tournamentManager.recordPairingResult(tournament.tournamentId, real.pairingId, real.player1EntryId);
    }

    expect(tournament.status).toBe('completed');
    expect(tournament.completedPairings).toHaveLength(6); // 3 rounds x (1 real win + 1 bye)
    const realGames = tournament.completedPairings.filter((p) => p.player2 !== null);
    expect(realGames).toHaveLength(3);
  });
});

describe('TournamentManager — round advancement (Double Elimination, 4 players)', () => {
  test('a full bracket plays out to a champion without a reset (winners finalist wins the grand final)', () => {
    const organizer = user();
    const tournament = tournamentManager.createTournament(organizer, { format: 'double_elim' }).tournament;
    const players = [user(), user(), user(), user()];
    const entries = players.map((p) => tournamentManager.registerPlayer(p, tournament.tournamentId).entryId);
    tournamentManager.startTournament(organizer.userId, tournament.tournamentId);

    const userByEntry = new Map(entries.map((e, i) => [e, players[i]]));

    function playPairing(localId, winnerEntryId) {
      const pairingId = `${tournament.tournamentId}:${localId}`;
      const pairing = tournamentManager.getPairing(pairingId);
      const u1 = userByEntry.get(pairing.player1EntryId);
      const u2 = userByEntry.get(pairing.player2EntryId);
      advanceToReady(tournament.tournamentId, pairingId, u1.userId, u2.userId);
      tournamentManager.markPairingReady(u1.userId, tournament.tournamentId, pairingId);
      tournamentManager.markPairingReady(u2.userId, tournament.tournamentId, pairingId);
      tournamentManager.recordPairingResult(tournament.tournamentId, pairingId, winnerEntryId);
    }

    // W1M1: seed1(entries[0]) vs seed4(entries[3]) -> seed1 wins.
    // W1M2: seed2(entries[1]) vs seed3(entries[2]) -> seed2 wins.
    playPairing('W1M1', entries[0]);
    playPairing('W1M2', entries[1]);

    // Losers bracket: L1M1 = loser(W1M1)=entries[3] vs loser(W1M2)=entries[2].
    let pairings = tournamentManager.listPairings(tournament.tournamentId);
    expect(pairings.some((p) => p.bracketMatchId === 'L1M1')).toBe(true);
    playPairing('L1M1', entries[3]); // entries[3] (seed4) survives the losers bracket

    // Winners final: W2M1 = winner(W1M1) vs winner(W1M2) = entries[0] vs entries[1].
    playPairing('W2M1', entries[0]); // seed1 wins winners bracket

    // Losers final: L2M1 = winner(L1M1)=entries[3] vs loser(W2M1)=entries[1].
    playPairing('L2M1', entries[3]);

    // Grand final: winner(W2M1)=entries[0] vs winner(L2M1)=entries[3].
    playPairing('GF', entries[0]); // winners-bracket finalist wins -> champion, no reset

    expect(tournament.status).toBe('completed');
    expect(tournament.entries.get(entries[0]).finalRank).toBe(1);
    expect(tournament.entries.get(entries[3]).finalRank).toBe(2);
    expect(tournamentManager.getPairing(`${tournament.tournamentId}:GF_RESET`)).toBeNull();
  });

  test('a bracket reset is played when the losers-bracket finalist wins the grand final', () => {
    const organizer = user();
    const tournament = tournamentManager.createTournament(organizer, { format: 'double_elim' }).tournament;
    const players = [user(), user(), user(), user()];
    const entries = players.map((p) => tournamentManager.registerPlayer(p, tournament.tournamentId).entryId);
    tournamentManager.startTournament(organizer.userId, tournament.tournamentId);
    const userByEntry = new Map(entries.map((e, i) => [e, players[i]]));

    function playPairing(localId, winnerEntryId) {
      const pairingId = `${tournament.tournamentId}:${localId}`;
      const pairing = tournamentManager.getPairing(pairingId);
      const u1 = userByEntry.get(pairing.player1EntryId);
      const u2 = userByEntry.get(pairing.player2EntryId);
      advanceToReady(tournament.tournamentId, pairingId, u1.userId, u2.userId);
      tournamentManager.markPairingReady(u1.userId, tournament.tournamentId, pairingId);
      tournamentManager.markPairingReady(u2.userId, tournament.tournamentId, pairingId);
      tournamentManager.recordPairingResult(tournament.tournamentId, pairingId, winnerEntryId);
    }

    playPairing('W1M1', entries[0]);
    playPairing('W1M2', entries[1]);
    playPairing('L1M1', entries[3]);
    playPairing('W2M1', entries[0]);
    playPairing('L2M1', entries[3]);
    playPairing('GF', entries[3]); // losers-bracket finalist wins -> reset required

    expect(tournament.status).toBe('active'); // not complete yet — reset match pending
    const resetPairing = tournamentManager.getPairing(`${tournament.tournamentId}:GF_RESET`);
    expect(resetPairing).not.toBeNull();
    expect(resetPairing.state).toBe('Negotiating');

    playPairing('GF_RESET', entries[3]); // entries[3] wins the reset too -> true champion
    expect(tournament.status).toBe('completed');
    expect(tournament.entries.get(entries[3]).finalRank).toBe(1);
    expect(tournament.entries.get(entries[0]).finalRank).toBe(2);
  });
});

describe('TournamentManager — deadline-sweep-driven walkover and void/replay', () => {
  function shortWindowTournament(format = 'swiss') {
    const organizer = user();
    const tournament = tournamentManager.createTournament(organizer, {
      format,
      ruleSet: { schedulingWindowMs: 5000 },
    }).tournament;
    return { organizer, tournament };
  }

  test('exactly one player ready when the deadline fires: Walkover, tournament completes (2-player swiss)', () => {
    const { organizer, tournament } = shortWindowTournament();
    const p1 = user(); const p2 = user();
    const { entryId: e1 } = tournamentManager.registerPlayer(p1, tournament.tournamentId);
    tournamentManager.registerPlayer(p2, tournament.tournamentId);
    tournamentManager.startTournament(organizer.userId, tournament.tournamentId);
    const [pairing] = tournamentManager.listPairings(tournament.tournamentId);

    advanceToReady(tournament.tournamentId, pairing.pairingId, p1.userId, p2.userId);
    tournamentManager.markPairingReady(p1.userId, tournament.tournamentId, pairing.pairingId); // only e1 checks in

    jest.advanceTimersByTime(config.TOURNAMENT_DEADLINE_SCAN_INTERVAL_MS + 6000);

    const resolved = tournamentManager.getPairing(pairing.pairingId);
    expect(resolved.state).toBe('Walkover');
    expect(resolved.result.winnerEntryId).toBe(e1);
    expect(tournament.status).toBe('completed');
  });

  test('nobody negotiates before the deadline: DoubleNoShow -> a fresh replay pairing is created (swiss)', () => {
    const { organizer, tournament } = shortWindowTournament();
    const p1 = user(); const p2 = user();
    tournamentManager.registerPlayer(p1, tournament.tournamentId);
    tournamentManager.registerPlayer(p2, tournament.tournamentId);
    tournamentManager.startTournament(organizer.userId, tournament.tournamentId);
    const [original] = tournamentManager.listPairings(tournament.tournamentId);

    jest.advanceTimersByTime(config.TOURNAMENT_DEADLINE_SCAN_INTERVAL_MS + 6000);

    expect(tournamentManager.getPairing(original.pairingId).state).toBe('DoubleNoShow');
    const pairings = tournamentManager.listPairings(tournament.tournamentId);
    const replay = pairings.find((p) => p.pairingId !== original.pairingId);
    expect(replay).toBeDefined();
    expect(replay.state).toBe('Negotiating');
    expect(replay.player1EntryId).toBe(original.player1EntryId);
    expect(replay.player2EntryId).toBe(original.player2EntryId);
    expect(tournament.status).toBe('active'); // not completed — replay is still pending
  });

  test('double_elim void/replay resets the SAME pairingId in place (bracket references it by id)', () => {
    const { organizer, tournament } = shortWindowTournament('double_elim');
    const players = [user(), user(), user(), user()];
    for (const p of players) tournamentManager.registerPlayer(p, tournament.tournamentId);
    tournamentManager.startTournament(organizer.userId, tournament.tournamentId);

    jest.advanceTimersByTime(config.TOURNAMENT_DEADLINE_SCAN_INTERVAL_MS + 6000);

    const w1m1Id = `${tournament.tournamentId}:W1M1`;
    const w1m1 = tournamentManager.getPairing(w1m1Id);
    expect(w1m1.state).toBe('Negotiating'); // reset in place, not DoubleNoShow
    expect(tournamentManager.listPairings(tournament.tournamentId).filter((p) => p.pairingId === w1m1Id)).toHaveLength(1);
  });
});
