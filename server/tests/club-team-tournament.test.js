'use strict';

/**
 * club-team-tournament.test.js — End-to-end backend tests for B236
 * (club-vs-club team tournament: permissions, rating-ordered rosters with
 * username tie-break, frozen rosters, alternating-color rounds, unrated play,
 * reconnect resync, single-board forfeits/walkovers, double-noshow cap, shared
 * rank-1 ties, restart hydration, and ClubService listing for both clubs).
 */

jest.useFakeTimers();

jest.mock('better-sqlite3', () => {
  const Actual = jest.requireActual('better-sqlite3');
  return function MockedDatabase() {
    return new Actual(':memory:');
  };
});

jest.mock('../utils/logger', () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const mockFindSocketsByUserId = jest.fn(() => []);
jest.mock('../socket/state', () => ({ findSocketsByUserId: mockFindSocketsByUserId }));

const tournamentManager = require('../managers/tournament/TournamentManager');
const TournamentMatchHandler = require('../socket/handlers/TournamentMatchHandler');
const tournamentState = require('../socket/tournamentState');
const clubService = require('../managers/ClubService');
const database = require('../db/database');

let seq = 0;
function makeUser(username, displayName, rating = null, category = 'freestyle') {
  seq++;
  const userId = `u_${username}_${seq}`;
  database.createUser({
    id: userId,
    username,
    passwordHash: 'x',
    displayName,
    createdAt: new Date().toISOString(),
  });
  if (rating !== null) {
    database.db.prepare(`
      INSERT INTO ratings (user_id, category, rating, rd, volatility, games, updated_at)
      VALUES (?, ?, ?, 80, 0.06, 25, ?)
    `).run(userId, category, rating, new Date().toISOString());
  }
  return { userId, username, displayName, isGuest: false };
}

function makeFakeIo(socketsByUser = new Map()) {
  const rooms = new Map();
  const emitted = [];
  const io = {
    emitted,
    sockets: {
      sockets: new Map(),
      adapter: { rooms },
    },
    to(room) {
      return {
        emit(event, payload) {
          emitted.push({ room, event, payload });
          const set = rooms.get(room);
          if (set) {
            for (const sid of set) {
              const sock = io.sockets.sockets.get(sid);
              if (sock) sock._events.push({ event, payload });
            }
          }
        },
      };
    },
    in(room) {
      return {
        socketsLeave(r) { rooms.delete(r); },
      };
    },
  };
  for (const [uid, sock] of socketsByUser) {
    io.sockets.sockets.set(sock.id, sock);
    void uid;
  }
  return io;
}

function makeFakeSocket(user, io) {
  const sock = {
    id: `sock_${user.userId}`,
    user,
    _events: [],
    join(room) {
      if (!io.sockets.adapter.rooms.has(room)) io.sockets.adapter.rooms.set(room, new Set());
      io.sockets.adapter.rooms.get(room).add(sock.id);
    },
    emit(event, payload) {
      sock._events.push({ event, payload });
    },
    on(event, fn) {
      sock._handlers[event] = fn;
    },
    _handlers: {},
  };
  return sock;
}

beforeEach(() => {
  tournamentManager.tournaments.clear();
  tournamentManager.pairings.clear();
  tournamentManager.userTournamentMap.clear();
  tournamentState.tournamentGameMap.clear();
  for (const timer of tournamentState.tournamentTimerMap.values()) timer.destroy();
  tournamentState.tournamentTimerMap.clear();
});

describe('B236 — club-vs-club team tournament lifecycle', () => {
  test('enforces role permissions, roster validation, dual-club conflict, and 2-club cap', () => {
    const org = makeUser('org1', 'Organizer');
    const c1Owner = makeUser('c1own', 'C1 Owner', 1700);
    const c1Officer = makeUser('c1off', 'C1 Officer', 1600);
    const c1Member = makeUser('c1mem', 'C1 Member', 1500);
    const c1Pending = makeUser('c1pen', 'C1 Pending', 1800);
    const dualMember = makeUser('dual1', 'Dual Member', 1550);

    const c2Owner = makeUser('c2own', 'C2 Owner', 1650);
    const c2Member = makeUser('c2mem', 'C2 Member', 1450);

    const c3Owner = makeUser('c3own', 'C3 Owner', 1600);
    const c3Member = makeUser('c3mem', 'C3 Member', 1400);
    const outsider = makeUser('out1', 'Outsider', 1500);

    const { slug: slug1 } = clubService.createClub(c1Owner.userId, { name: 'CLB Phượng Hoàng', joinPolicy: 'invite', tag: 'PH', color: 'red' });
    clubService.invite(c1Owner.userId, slug1, c1Officer.userId);
    clubService.join(c1Officer.userId, slug1);
    clubService.setRole(c1Owner.userId, slug1, c1Officer.userId, 'officer');
    clubService.invite(c1Owner.userId, slug1, c1Member.userId);
    clubService.join(c1Member.userId, slug1);
    clubService.invite(c1Owner.userId, slug1, dualMember.userId);
    clubService.join(dualMember.userId, slug1);
    clubService.join(c1Pending.userId, slug1); // stays 'pending'

    const { slug: slug2 } = clubService.createClub(c2Owner.userId, { name: 'CLB Thanh Long', joinPolicy: 'open', tag: 'TL', color: 'teal' });
    clubService.join(c2Member.userId, slug2);
    clubService.join(dualMember.userId, slug2);

    const { slug: slug3 } = clubService.createClub(c3Owner.userId, { name: 'CLB Bạch Hổ', joinPolicy: 'open' });
    clubService.join(c3Member.userId, slug3);

    const { tournament } = tournamentManager.createTournament(org, {
      name: 'Đại chiến CLB',
      format: 'team',
      ruleSet: { boardCount: 2, teamRounds: 2, seriesMode: 'fixedCount', seriesGameCount: 5 },
    });
    // seriesMode forced to 'single' for team format
    expect(tournament.ruleSet).toMatchObject({ boardCount: 2, teamRounds: 2, seriesMode: 'single', seriesGameCount: null });

    // Individual registration/unregistration rejected
    expect(tournamentManager.registerPlayer(c1Member, tournament.tournamentId).code).toBe('TEAM_CAPTAIN_ONLY');
    expect(tournamentManager.unregisterPlayer(c1Member.userId, tournament.tournamentId).code).toBe('TEAM_CAPTAIN_ONLY');

    // Guest, outsider, pending, and plain member cannot submit roster
    expect(tournamentManager.registerTeam({ userId: 'g1', displayName: 'G', isGuest: true }, tournament.tournamentId, {
      clubSlug: slug1, usernames: [c1Owner.username, c1Member.username],
    }).code).toBe('GUEST_FORBIDDEN');
    expect(tournamentManager.registerTeam(outsider, tournament.tournamentId, {
      clubSlug: slug1, usernames: [c1Owner.username, c1Member.username],
    }).code).toBe('CLUB_FORBIDDEN');
    expect(tournamentManager.registerTeam(c1Pending, tournament.tournamentId, {
      clubSlug: slug1, usernames: [c1Owner.username, c1Member.username],
    }).code).toBe('CLUB_FORBIDDEN');
    expect(tournamentManager.registerTeam(c1Member, tournament.tournamentId, {
      clubSlug: slug1, usernames: [c1Owner.username, c1Member.username],
    }).code).toBe('CLUB_FORBIDDEN');

    // Pending applicant or outsider in roster rejected; duplicate rejected; wrong size rejected
    expect(tournamentManager.registerTeam(c1Owner, tournament.tournamentId, {
      clubSlug: slug1, usernames: [c1Owner.username, c1Pending.username],
    }).code).toBe('CLUB_NOT_MEMBER');
    expect(tournamentManager.registerTeam(c1Owner, tournament.tournamentId, {
      clubSlug: slug1, usernames: [c1Owner.username, c1Owner.username],
    }).code).toBe('DUPLICATE_ROSTER_MEMBER');
    expect(tournamentManager.registerTeam(c1Owner, tournament.tournamentId, {
      clubSlug: slug1, usernames: [c1Owner.username],
    }).code).toBe('INVALID_ROSTER_SIZE');

    // Locked club rejected
    database.db.prepare('UPDATE clubs SET locked = 1 WHERE slug = ?').run(slug1);
    expect(tournamentManager.registerTeam(c1Owner, tournament.tournamentId, {
      clubSlug: slug1, usernames: [c1Owner.username, dualMember.username],
    }).code).toBe('CLUB_LOCKED');
    database.db.prepare('UPDATE clubs SET locked = 0 WHERE slug = ?').run(slug1);

    // Officer can register C1 roster; cannot start with only 1 team
    expect(tournamentManager.registerTeam(c1Officer, tournament.tournamentId, {
      clubSlug: slug1, usernames: [dualMember.username, c1Owner.username],
    }).error).toBeUndefined();
    expect(tournamentManager.startTournament(org.userId, tournament.tournamentId).code).toBe('NOT_ENOUGH_TEAMS');

    // Dual-club member already on C1 cannot also be registered on C2
    expect(tournamentManager.registerTeam(c2Owner, tournament.tournamentId, {
      clubSlug: slug2, usernames: [c2Owner.username, dualMember.username],
    }).code).toBe('PLAYER_IN_OTHER_TEAM');

    // Valid C2 registration succeeds; 3rd club rejected with TOURNAMENT_FULL
    expect(tournamentManager.registerTeam(c2Owner, tournament.tournamentId, {
      clubSlug: slug2, usernames: [c2Member.username, c2Owner.username],
    }).error).toBeUndefined();
    expect(tournamentManager.registerTeam(c3Owner, tournament.tournamentId, {
      clubSlug: slug3, usernames: [c3Owner.username, c3Member.username],
    }).code).toBe('TOURNAMENT_FULL');

    // Unregister denied to plain member, allowed to captain; frees slot for C3
    expect(tournamentManager.unregisterTeam(c2Member.userId, tournament.tournamentId, slug2).code).toBe('TOURNAMENT_CLUB_FORBIDDEN');
    expect(tournamentManager.unregisterTeam(c2Owner.userId, tournament.tournamentId, slug2).error).toBeUndefined();
    expect(tournamentManager.registerTeam(c3Owner, tournament.tournamentId, {
      clubSlug: slug3, usernames: [c3Member.username, c3Owner.username],
    }).error).toBeUndefined();

    // Both participating clubs list the tournament in Giải của CLB
    expect(clubService.getClubDetail(slug1, c1Member.userId).tournaments.map((t) => t.id)).toContain(tournament.tournamentId);
    expect(clubService.getClubDetail(slug3, c3Member.userId).tournaments.map((t) => t.id)).toContain(tournament.tournamentId);
    expect(clubService.getClubDetail(slug2, c2Member.userId).tournaments.map((t) => t.id)).not.toContain(tournament.tournamentId);
  });

  test('orders rosters by rating DESC with username tie-break, freezes at start, alternates colors across rounds, stays unrated, reconnects, and shares rank 1 on tied totals', () => {
    const aCap = makeUser('zara_cap', 'Zara Captain', 1500, 'standard');
    const aTie = makeUser('anh_tie', 'Anh Tie', 1500, 'standard');
    const aTop = makeUser('minh_top', 'Minh Top', 1750, 'standard');
    const aUnrated = makeUser('unrated_a', 'Unrated A', null, 'standard');

    const b1 = makeUser('bao_1', 'Bảo 1', 1800, 'standard');
    const b2 = makeUser('chau_2', 'Châu 2', 1600, 'standard');
    const b3 = makeUser('dung_3', 'Dũng 3', 1400, 'standard');
    const b4 = makeUser('em_4', 'Em 4', null, 'standard');

    const { slug: slugA } = clubService.createClub(aCap.userId, { name: 'Hội Cờ Hà Nội', tag: 'HN', color: 'blue' });
    [aTie, aTop, aUnrated].forEach((u) => clubService.join(u.userId, slugA));

    const { slug: slugB } = clubService.createClub(b1.userId, { name: 'Hội Cờ Sài Gòn', tag: 'SG', color: 'orange' });
    [b2, b3, b4].forEach((u) => clubService.join(u.userId, slugB));

    const { tournament } = tournamentManager.createTournament(aCap, {
      name: 'Giao hữu Bắc Nam',
      format: 'team',
      clubSlug: slugA,
      ruleSet: { winningRule: 'standard', boardSize: 15, boardCount: 4, teamRounds: 2 },
    });

    // Submit in scrambled order
    expect(tournamentManager.registerTeam(aCap, tournament.tournamentId, {
      clubSlug: slugA,
      usernames: [aUnrated.username, aCap.username, aTop.username, aTie.username],
    }).error).toBeUndefined();
    expect(tournamentManager.registerTeam(b1, tournament.tournamentId, {
      clubSlug: slugB,
      usernames: [b4.username, b2.username, b1.username, b3.username],
    }).error).toBeUndefined();

    // Verify board order: 1750 (minh_top), 1500 (anh_tie before zara_cap by username!), null (unrated_a)
    const snapBefore = tournamentManager.serializeTournament(tournament);
    expect(snapBefore.teams[0].roster.map((r) => [r.boardNumber, r.displayName, r.ratingAtReg])).toEqual([
      [1, 'Minh Top', 1750],
      [2, 'Anh Tie', 1500],
      [3, 'Zara Captain', 1500],
      [4, 'Unrated A', null],
    ]);

    // Mutate ratings in DB after registration -> start must keep frozen registration order
    database.db.prepare('UPDATE ratings SET rating = 2100 WHERE user_id = ?').run(aCap.userId);
    expect(tournamentManager.startTournament(aCap.userId, tournament.tournamentId).error).toBeUndefined();

    // Roster mutations blocked after start
    expect(tournamentManager.registerTeam(aCap, tournament.tournamentId, {
      clubSlug: slugA, usernames: [aTop.username, aTie.username, aCap.username, aUnrated.username],
    }).code).toBe('TOURNAMENT_ALREADY_STARTED');
    expect(tournamentManager.unregisterTeam(b1.userId, tournament.tournamentId, slugB).code).toBe('TOURNAMENT_ALREADY_STARTED');

    const teamA = snapBefore.teams[0].roster.map((r) => r.entryId);
    const teamB = snapBefore.teams[1].roster.map((r) => r.entryId);

    // Round 1 pairings: Board 1 (A1 Black vs B1 White), Board 2 (B2 Black vs A2 White), Board 3 (A3 vs B3), Board 4 (B4 vs A4)
    const r1 = tournamentManager.listPairings(tournament.tournamentId)
      .filter((p) => p.roundIndex === 1)
      .sort((x, y) => tournamentManager.serializePairing(x).boardNumber - tournamentManager.serializePairing(y).boardNumber);
    expect(r1.map((p) => [p.player1EntryId, p.player2EntryId])).toEqual([
      [teamA[0], teamB[0]],
      [teamB[1], teamA[1]],
      [teamA[2], teamB[2]],
      [teamB[3], teamA[3]],
    ]);

    // Play Board 1 through real TournamentMatchHandler (verify colors, reconnect resync, and unrated)
    const io = makeFakeIo();
    const sockA = makeFakeSocket(aTop, io);
    const sockB = makeFakeSocket(b1, io);
    io.sockets.sockets.set(sockA.id, sockA);
    io.sockets.sockets.set(sockB.id, sockB);
    TournamentMatchHandler.register(io, sockA);
    TournamentMatchHandler.register(io, sockB);
    mockFindSocketsByUserId.mockImplementation((_io, uid) => {
      if (uid === aTop.userId) return [sockA];
      if (uid === b1.userId) return [sockB];
      return [];
    });

    const board1 = r1[0];
    const future = new Date(Date.now() + 3600_000).toISOString();
    tournamentManager.reportPairingTime(aTop.userId, tournament.tournamentId, board1.pairingId, future);
    tournamentManager.confirmPairingTime(b1.userId, tournament.tournamentId, board1.pairingId);
    tournamentManager.markPairingReady(aTop.userId, tournament.tournamentId, board1.pairingId);
    tournamentManager.markPairingReady(b1.userId, tournament.tournamentId, board1.pairingId);
    TournamentMatchHandler.startMatch(io, tournament.tournamentId, board1.pairingId);

    const initEvent = sockA._events.find((e) => e.event === 'tmatch:init');
    expect(initEvent).toBeDefined();
    expect(initEvent.payload.players).toEqual([
      expect.objectContaining({ userId: aTop.userId, color: 'BLACK' }),
      expect.objectContaining({ userId: b1.userId, color: 'WHITE' }),
    ]);

    // Reconnect resync works identically to individual tournaments
    const reconnectSock = makeFakeSocket(aTop, io);
    TournamentMatchHandler.resyncOnConnect(io, reconnectSock);
    expect(reconnectSock._events.find((e) => e.event === 'tmatch:init')?.payload.pairingId).toBe(board1.pairingId);

    // Resign board 1 -> B1 wins (Team B +1)
    sockA._handlers['tmatch:resign']({ tournamentId: tournament.tournamentId, pairingId: board1.pairingId });
    expect(tournamentManager.getPairing(board1.pairingId).state).toBe('Completed');
    // Unrated check: b1's rating row unchanged at 1800 / 25 games
    expect(database.db.prepare('SELECT rating, games FROM ratings WHERE user_id = ?').get(b1.userId)).toEqual({ rating: 1800, games: 25 });

    // Board 2: single-board walkover via deadline (A2 checked in, B2 absent -> Team A +1)
    const board2 = r1[1];
    tournamentManager.reportPairingTime(aTie.userId, tournament.tournamentId, board2.pairingId, future);
    tournamentManager.confirmPairingTime(b2.userId, tournament.tournamentId, board2.pairingId);
    tournamentManager.markPairingReady(aTie.userId, tournament.tournamentId, board2.pairingId);
    tournamentManager._handlePairingDeadline(board2.pairingId, tournament.tournamentId);
    expect(tournamentManager.getPairing(board2.pairingId)).toMatchObject({
      state: 'Walkover',
      result: { winnerEntryId: teamA[1], reason: 'walkover' },
    });

    // Board 3: draw (0.5 - 0.5)
    const board3 = r1[2];
    board3.state = 'InProgress';
    tournamentManager.recordPairingResult(tournament.tournamentId, board3.pairingId, 'draw');

    // Board 4: DoubleNoShow hitting NO_SHOW_REPLAY_CAP -> 0 - 0 (no seed gift!)
    let board4 = r1[3];
    board4.noShowCount = 2;
    tournamentManager._handlePairingDeadline(board4.pairingId, tournament.tournamentId);
    expect(tournamentManager.getPairing(board4.pairingId)).toMatchObject({
      state: 'DoubleNoShow',
      result: { winnerEntryId: null, reason: 'noshow_cap' },
    });

    // Round 1 complete -> Round 2 auto-materialized with flipped colors on every board!
    expect(tournament.currentRoundIndex).toBe(2);
    const r2 = tournamentManager.listPairings(tournament.tournamentId)
      .filter((p) => p.roundIndex === 2)
      .sort((x, y) => tournamentManager.serializePairing(x).boardNumber - tournamentManager.serializePairing(y).boardNumber);
    expect(r2.map((p) => [p.player1EntryId, p.player2EntryId])).toEqual([
      [teamB[0], teamA[0]],
      [teamA[1], teamB[1]],
      [teamB[2], teamA[2]],
      [teamA[3], teamB[3]],
    ]);

    // Simulate server restart mid-tournament -> hydrate from SQLite!
    const tid = tournament.tournamentId;
    tournamentManager.tournaments.clear();
    tournamentManager.pairings.clear();
    tournamentManager.userTournamentMap.clear();
    tournamentManager.loadTournamentsFromDb();

    const reloaded = tournamentManager.getTournament(tid);
    expect(reloaded.status).toBe('active');
    expect(reloaded.currentRoundIndex).toBe(2);
    expect(reloaded.teams.size).toBe(2);

    // Finish Round 2 so total scores tie (Round 1 was 1.5 - 1.5; make Round 2 all draws -> 3.5 - 3.5!)
    const r2Reloaded = tournamentManager.listPairings(tid).filter((p) => p.roundIndex === 2);
    for (const p of r2Reloaded) {
      p.state = 'InProgress';
      tournamentManager.recordPairingResult(tid, p.pairingId, 'draw');
    }

    expect(reloaded.status).toBe('completed');
    const finalSnap = tournamentManager.serializeTournament(reloaded);
    expect(finalSnap.teams.map((t) => ({ slug: t.clubSlug, score: t.score, rank: t.rank, finalRank: t.finalRank }))).toEqual([
      { slug: slugA, score: 3.5, rank: 1, finalRank: 1 },
      { slug: slugB, score: 3.5, rank: 1, finalRank: 1 },
    ]);

    // Reload completed tournament -> persisted final_rank = 1 for both teams survives!
    tournamentManager.tournaments.clear();
    tournamentManager.pairings.clear();
    tournamentManager.loadTournamentsFromDb();
    const afterDone = tournamentManager.serializeTournament(tournamentManager.getTournament(tid));
    expect(afterDone.teams.map((t) => t.finalRank)).toEqual([1, 1]);

    // Also test single-board withdrawal forfeit in an active match (does not forfeit whole team)
    const { tournament: tForfeit } = tournamentManager.createTournament(aCap, {
      name: 'Forfeit Check',
      format: 'team',
      ruleSet: { winningRule: 'standard', boardCount: 2, teamRounds: 1 },
    });
    tournamentManager.registerTeam(aCap, tForfeit.tournamentId, { clubSlug: slugA, usernames: [aTop.username, aTie.username] });
    tournamentManager.registerTeam(b1, tForfeit.tournamentId, { clubSlug: slugB, usernames: [b1.username, b2.username] });
    tournamentManager.startTournament(aCap.userId, tForfeit.tournamentId);

    // aTop withdraws -> Board 1 forfeits to b1 (+1 for Team B), Board 2 stays Negotiating!
    expect(tournamentManager.withdrawPlayer(aTop.userId, tForfeit.tournamentId).error).toBeUndefined();
    const fPairings = tournamentManager.listPairings(tForfeit.tournamentId)
      .sort((x, y) => tournamentManager.serializePairing(x).boardNumber - tournamentManager.serializePairing(y).boardNumber);
    expect(fPairings[0].state).toBe('Walkover');
    expect(fPairings[1].state).toBe('Negotiating');
    // Finish Board 2 for aTie -> Team A +1, Wait: let b2 win Board 2 so Team B wins 2-0 (rank 1 vs rank 2)!
    fPairings[1].state = 'InProgress';
    tournamentManager.recordPairingResult(tForfeit.tournamentId, fPairings[1].pairingId, fPairings[1].player1EntryId);
    expect(tForfeit.status).toBe('completed');
    const fSnap = tournamentManager.serializeTournament(tForfeit);
    // Board 2 in Round 1 has player1 = Team B's board 2 (b2), so Team B wins 2-0 -> rank 1 vs rank 2!
    expect(fSnap.teams.map((t) => ({ slug: t.clubSlug, score: t.score, rank: t.rank, finalRank: t.finalRank }))).toEqual([
      { slug: slugA, score: 0, rank: 2, finalRank: 2 },
      { slug: slugB, score: 2, rank: 1, finalRank: 1 },
    ]);

    mockFindSocketsByUserId.mockReset();
  });
});
