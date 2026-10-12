'use strict';

/**
 * routes/home.js — GET /api/home: data for the lobby "Chơi" dashboard (B195, R2).
 *
 * Rooms + tournaments come from their managers (in memory); the #224 blocks read the DB via contentOf():
 *   myGame     — the room the caller is seated in, if any
 *   myMatches  — the caller's open tournament pairings (not byes, not Completed)
 *   tournaments — up to 5 draft/active tournaments, with a `registered` flag
 *   live       — up to 3 playing rooms with the most spectators (names, rule, move count — no stones)
 *   stats      — { online, playing, searching } site-wide counters (B223)
 *   news       — newest admin announcement { id, body, link, createdAt } or null (#224, DB)
 *   forum      — top 3 most recently active forum threads, titles only (#224, DB)
 *   learn      — { total, solved } approved puzzles / solved by the caller (null for guests) (#224, DB)
 *   newcomer   — guest, or a member with fewer than NEWCOMER_GAMES finished games: show the About block (#224)
 *
 * Session is optional: guests / signed-out callers get `tournaments` + `live`.
 * Never sends other users' ids — names only.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const { ipKeyGenerator } = require('express-rate-limit');
const { getClientIpFromReq } = require('../utils/get-client-ip');
const { readSessionIdFromHeader } = require('../utils/session-cookie');
const sessionManager = require('../managers/SessionManager');
const roomManager = require('../managers/RoomManager');
const tournamentManager = require('../managers/tournament/TournamentManager');

const LIVE_LIMIT = 3;
const TOURNAMENT_LIMIT = 5;
const FORUM_LIMIT = 3;
const NEWCOMER_GAMES = 5;

function seatedPlayers(room) {
  return [...room.users.values()].filter((u) => u.slot === 1 || u.slot === 2);
}

function ruleOf(room) {
  const s = room.settings || {};
  return {
    winningRule: s.winningRule,
    timerMode: s.timerMode,
    timerSeconds: s.timerSeconds,
    timerIncrementSeconds: s.timerIncrementSeconds,
  };
}

function myGameOf(userId, rooms) {
  const room = rooms.getRoomByUser(userId);
  if (!room) return null;
  const me = room.users.get(userId);
  if (!me || (me.slot !== 1 && me.slot !== 2)) return null; // spectating isn't "my game"
  const opp = seatedPlayers(room).find((u) => u.userId !== userId);
  const engine = room.state === 'playing' ? room.gameState : null;
  return {
    roomId: room.roomId,
    roomName: room.roomName,
    state: room.state,
    opponent: opp ? opp.displayName : null,
    myTurn: !!(engine && engine.currentTurn === userId),
    ...ruleOf(room),
  };
}

function myMatchesOf(userId, tm) {
  const out = [];
  for (const p of tm.pairings.values()) {
    if (p.state === 'Completed' || !p.player2EntryId) continue;
    const t = tm.getTournament(p.tournamentId);
    if (!t) continue;
    const a = t.entries.get(p.player1EntryId);
    const b = t.entries.get(p.player2EntryId);
    if (!a || !b) continue;
    const mine = a.userId === userId ? a : b.userId === userId ? b : null;
    if (!mine) continue;
    out.push({
      tournamentId: t.tournamentId,
      tournamentName: t.name,
      pairingId: p.pairingId,
      roundIndex: p.roundIndex ?? null,
      opponent: (mine === a ? b : a).displayName,
      state: p.state,
      agreedTime: p.agreedTime || null,
      deadline: p.deadline || null,
    });
  }
  return out;
}

function tournamentsOf(userId, tm) {
  return tm.listTournaments()
    .filter((t) => t.status === 'draft' || t.status === 'active')
    .slice(0, TOURNAMENT_LIMIT)
    .map((t) => ({
      tournamentId: t.tournamentId,
      name: t.name,
      format: t.format,
      status: t.status,
      playerCount: t.playerCount,
      registered: !!userId && t.entryUserIds.includes(userId),
    }));
}

function liveOf(rooms) {
  const out = [];
  for (const room of rooms.rooms.values()) {
    if (room.state !== 'playing' || !room.gameState) continue;
    const engine = room.gameState;
    const players = engine.players || [];
    const name = (color) => (players.find((p) => p.color === color) || {}).displayName || null;
    let viewers = 0;
    for (const u of room.users.values()) {
      if (u.slot === null && u.presence !== 'disconnected') viewers++;
    }
    out.push({
      roomId: room.roomId,
      roomName: room.roomName,
      black: name('BLACK'),
      white: name('WHITE'),
      viewers,
      boardSize: engine.boardSize,
      moves: (engine.moveHistory || []).length,
      ...ruleOf(room),
    });
  }
  return out.sort((a, b) => b.viewers - a.viewers || b.moves - a.moves).slice(0, LIVE_LIMIT);
}

function playingCount(rooms) {
  let n = 0;
  for (const room of rooms.rooms.values()) if (room.state === 'playing' && room.gameState) n++;
  return n;
}

// Lazy: MatchHandler pulls in the socket layer, which this route (and its tests) should not load eagerly.
const defaultQueueCounts = () => require('../socket/handlers/MatchHandler').queueCounts();
const defaultOnline = () => require('../socket/state').getOnlineUsersList().length;
const defaultQueueEta = () => require('../socket/handlers/MatchHandler').queueEstimates();

const EMPTY_CONTENT = (member) => ({ news: null, forum: [], learn: null, newcomer: !member });

/**
 * DB-backed blocks (#224). Lazy requires, so tests that fake the managers never open the DB.
 * Fail-soft: a DB error drops these blocks (logged) instead of failing the live/tournament half.
 */
function defaultContent(member) {
  try {
    return readContent(member);
  } catch (err) {
    require('../utils/logger').warn('[home] content blocks unavailable: ' + err.message);
    return EMPTY_CONTENT(member);
  }
}

function readContent(member) {
  const database = require('../db/database');
  const games = member
    ? database.db.prepare('SELECT COUNT(*) AS n FROM (SELECT 1 FROM player_games WHERE player_id = ? LIMIT ?)').get(member, NEWCOMER_GAMES).n
    : 0;
  return {
    news: require('../managers/NewsService').latest(),
    forum: require('../managers/ForumService').topThreads(FORUM_LIMIT)
      .map((t) => ({ id: t.id, title: t.title, category: t.category, replyCount: t.replyCount, lastPostAt: t.lastPostAt, author: t.author.displayName })),
    learn: require('../managers/PuzzleService').learnSummary(member),
    newcomer: !member || games < NEWCOMER_GAMES,
  };
}

/**
 * Build the dashboard payload. `user` is a session ({ userId, isGuest }) or null.
 * Managers are injected so tests can pass fakes.
 */
function buildHome(user, rooms = roomManager, tm = tournamentManager, queueCounts = defaultQueueCounts, queueEta = defaultQueueEta, online = defaultOnline, content = defaultContent) {
  const member = user && !user.isGuest ? user.userId : null;
  const seatedId = user ? user.userId : null; // guests can sit in casual rooms too
  const queue = queueCounts();
  return {
    myGame: seatedId ? myGameOf(seatedId, rooms) : null,
    myMatches: member ? myMatchesOf(member, tm) : [],
    tournaments: tournamentsOf(member, tm),
    live: liveOf(rooms),
    queue, // { 'caro|5+3': n } — quick-match waiters per rule|time (B210)
    stats: { online: online(), playing: playingCount(rooms), searching: Object.values(queue).reduce((a, b) => a + b, 0) },
    queueEta: queueEta(), // { 'caro|5+3': seconds } — median recent wait, only with enough samples
    ...content(member),
  };
}

const router = express.Router();

router.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  keyGenerator: (req) => ipKeyGenerator(getClientIpFromReq(req) || ''),
}));

router.get('/', (req, res, next) => {
  try {
    const sid = readSessionIdFromHeader(req.headers.cookie);
    const session = sid ? sessionManager.getValidSession(sid) : null;
    res.set('Cache-Control', 'no-store');
    res.json(buildHome(session));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.buildHome = buildHome;
module.exports.liveOf = liveOf; // B225: socket/home-feed.js pushes these between polls
module.exports.playingCount = playingCount;
