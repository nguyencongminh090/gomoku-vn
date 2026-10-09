'use strict';

/**
 * routes/home.js — GET /api/home: data for the lobby "Chơi" dashboard (B195, R2).
 *
 * In-memory only (rooms + tournaments live in their managers; no DB read):
 *   myGame     — the room the caller is seated in, if any
 *   myMatches  — the caller's open tournament pairings (not byes, not Completed)
 *   tournaments — up to 5 draft/active tournaments, with a `registered` flag
 *   live       — up to 3 playing rooms with the most spectators, stones included
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
const MAX_STONES = 400; // > any board this site offers; caps the payload regardless

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
      stones: (engine.moveHistory || []).slice(-MAX_STONES).map((m) => [m.x, m.y, m.color === 'WHITE' ? 2 : 1]),
      ...ruleOf(room),
    });
  }
  return out.sort((a, b) => b.viewers - a.viewers || b.stones.length - a.stones.length).slice(0, LIVE_LIMIT);
}

/**
 * Build the dashboard payload. `user` is a session ({ userId, isGuest }) or null.
 * Managers are injected so tests can pass fakes.
 */
function buildHome(user, rooms = roomManager, tm = tournamentManager) {
  const member = user && !user.isGuest ? user.userId : null;
  const seatedId = user ? user.userId : null; // guests can sit in casual rooms too
  return {
    myGame: seatedId ? myGameOf(seatedId, rooms) : null,
    myMatches: member ? myMatchesOf(member, tm) : [],
    tournaments: tournamentsOf(member, tm),
    live: liveOf(rooms),
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
