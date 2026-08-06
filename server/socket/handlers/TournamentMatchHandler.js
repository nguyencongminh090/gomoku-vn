'use strict';

/**
 * TournamentMatchHandler.js — drives GameEngine directly for a tournament
 * pairing once it reaches InProgress. Deliberately NOT GameHandler.js/
 * RoomManager — the architectural constraint from
 * features/tournament/user_story.md ("session model kept separate from
 * casual games"). Room key is `tournament-match:<pairingId>`, disjoint from
 * casual rooms' `roomId`-keyed Socket.io rooms.
 *
 * Events handled:
 *   tmatch:move / tmatch:swap2_place / tmatch:swap2_choice / tmatch:resign
 *
 * startMatch(io, tournamentId, pairingId) is exported for TournamentHandler's
 * init() to call when TournamentManager emits 'pairing_ready' (both players
 * checked in). resyncOnConnect(io, socket) is exported for SocketHandler.js
 * to call on every connection, so a reconnecting player rejoins their live
 * match room the same way the casual-room reconnect block does for RoomManager.
 *
 * Scope decision (Phase 4, see docs/instruction/B48-*.md "Cập nhật 2026-08-05"):
 * draw offers and the bonus-time-request flow (game:draw_offer/accept/decline,
 * game:request_time/time_accept/time_decline in GameHandler.js) are NOT
 * ported here — a tournament match still ends correctly on a natural
 * five-in-a-row/board-full result, resignation, or clock timeout, which
 * covers decision 1's "round loss only" outcomes. Draw offers/time banks are
 * a casual-play convenience, not part of the locked tournament spec, and are
 * left as a follow-up rather than expanding this phase's surface further.
 */

const logger = require('../../utils/logger');
const { GameEngine } = require('../../managers/GameEngine');
const WallGenerator = require('../../generators/WallGenerator');
const PortalGenerator = require('../../generators/PortalGenerator');
const tournamentManager = require('../../managers/tournament/TournamentManager');
const tournamentState = require('../tournamentState');
const { findSocketsByUserId } = require('../state');

function matchRoom(pairingId) {
  return `tournament-match:${pairingId}`;
}

/**
 * Build the board/wall/portal layout for a match, mirroring
 * GameHandler.startGame's retry loop exactly (same generators, same 1000-try
 * cap) since ruleSet's wall/portal fields are validated with the same rules
 * as a casual room's settings (see TournamentManager._validateRuleSet).
 */
function _generateLayout(ruleSet) {
  let walls = [], firstMoveZones = [], portals = [];
  let attempts = 0;

  while (attempts < 1000) {
    attempts++;
    walls = []; firstMoveZones = []; portals = [];

    let ok = true;
    if (ruleSet.ruleWall) {
      const wResult = WallGenerator.generate(ruleSet.boardSize);
      if (!wResult) { ok = false; }
      else { walls = wResult.walls; firstMoveZones = wResult.firstMoveZones; }
    }
    if (!ok) continue;

    if (ruleSet.rulePortal) {
      const pResult = PortalGenerator.generate(ruleSet.boardSize, walls);
      if (!pResult) { ok = false; }
      else { portals = pResult.portals; }
    }
    if (!ok) continue;

    return { walls, firstMoveZones, portals };
  }
  return null;
}

/**
 * Start the live game for a pairing that just reached InProgress. Called
 * from TournamentHandler's 'pairing_ready' listener — TournamentManager
 * itself never touches io (see its class header), so this is the one place
 * a pairing's checked-in state turns into an actual GameEngine.
 *
 * @param {import('socket.io').Server} io
 * @param {string} tournamentId
 * @param {string} pairingId
 */
function startMatch(io, tournamentId, pairingId) {
  const tournament = tournamentManager.getTournament(tournamentId);
  const pairing = tournamentManager.getPairing(pairingId);
  if (!tournament || !pairing || pairing.state !== 'InProgress') return;

  const entry1 = tournament.entries.get(pairing.player1EntryId);
  const entry2 = tournament.entries.get(pairing.player2EntryId);
  if (!entry1 || !entry2) return;

  const ruleSet = tournament.ruleSet;
  const layout = _generateLayout(ruleSet);
  if (!layout) {
    logger.warn(`[TournamentMatch] Map generation failed for pairing ${pairingId} — leaving pairing InProgress without a match.`);
    return;
  }

  // player1EntryId is TimerManager's "black" slot, player2EntryId is "white"
  // (see PairingLifecycle.markReady) — colors mirror that pairing here so a
  // timeout's blackPlayerId/whitePlayerId label lines up with who is
  // actually assigned that color below.
  const engine = new GameEngine({
    roomId: pairingId,
    boardSize: ruleSet.boardSize,
    players: ruleSet.ruleSwap2
      ? [
          { userId: entry1.userId, displayName: entry1.displayName, color: null, isGuest: entry1.isGuest },
          { userId: entry2.userId, displayName: entry2.displayName, color: null, isGuest: entry2.isGuest },
        ]
      : [
          { userId: entry1.userId, displayName: entry1.displayName, color: 'BLACK', isGuest: entry1.isGuest },
          { userId: entry2.userId, displayName: entry2.displayName, color: 'WHITE', isGuest: entry2.isGuest },
        ],
    walls: layout.walls,
    portals: layout.portals,
    firstMoveZones: layout.firstMoveZones,
    winningRule: ruleSet.winningRule,
    ruleSwap2: ruleSet.ruleSwap2,
  });

  const entryByUserId = new Map([[entry1.userId, entry1.entryId], [entry2.userId, entry2.entryId]]);
  const userIdByEntry = new Map([[entry1.entryId, entry1.userId], [entry2.entryId, entry2.userId]]);

  tournamentState.tournamentGameMap.set(pairingId, {
    engine, tournamentId, entryByUserId, userIdByEntry,
  });

  for (const userId of [entry1.userId, entry2.userId]) {
    for (const sock of findSocketsByUserId(io, userId)) sock.join(matchRoom(pairingId));
  }

  const timer = tournamentState.tournamentTimerMap.get(pairingId);
  if (timer) {
    // markReady() (PairingLifecycle.js) constructs the TimerManager before
    // any GameEngine exists, so onTimeout is wired here instead of at
    // construction — see that function's doc comment.
    timer.onTimeout = (timedOutEntryId) => _handleTimeout(io, tournamentId, pairingId, timedOutEntryId);
  }

  io.to(matchRoom(pairingId)).emit('tmatch:init', {
    tournamentId,
    pairingId,
    ...engine.serialize(),
    timer: timer ? timer.getTimers() : null,
    timerSync: timer ? timer.getSync() : null,
  });
  logger.info(`[TournamentMatch] Match started for pairing ${pairingId}`);
}

/**
 * Reconnect support: if this user has a live tournament match, rejoin them
 * to its room and resync current state — mirrors SocketHandler.js's
 * existingRoom reconnect block for casual rooms.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function resyncOnConnect(io, socket) {
  const userId = socket.user.userId;
  for (const [pairingId, match] of tournamentState.tournamentGameMap) {
    if (!match.entryByUserId.has(userId)) continue;
    socket.join(matchRoom(pairingId));
    const timer = tournamentState.tournamentTimerMap.get(pairingId);
    socket.emit('tmatch:init', {
      tournamentId: match.tournamentId,
      pairingId,
      ...match.engine.serialize(),
      timer: timer ? timer.getTimers() : null,
      timerSync: timer ? timer.getSync() : null,
    });
    return;
  }
}

function _handleTimeout(io, tournamentId, pairingId, timedOutEntryId) {
  const match = tournamentState.tournamentGameMap.get(pairingId);
  if (!match) return;
  const timedOutUserId = match.userIdByEntry.get(timedOutEntryId);
  if (!timedOutUserId) return;

  match.engine.handleTimeout(timedOutUserId);
  const finalResult = match.engine.result;
  io.to(matchRoom(pairingId)).emit('tmatch:ended', { tournamentId, pairingId, result: finalResult });
  _endMatch(io, tournamentId, pairingId, finalResult);
}

/** Resolve TournamentManager.recordPairingResult from a finished engine's result, then tear down local match state. */
function _endMatch(io, tournamentId, pairingId, engineResult) {
  const match = tournamentState.tournamentGameMap.get(pairingId);
  if (!match) return;

  const pairing = tournamentManager.getPairing(pairingId);
  if (pairing) pairing.moves = match.engine.moveHistory;

  const outcome = engineResult.winner === 'draw' ? 'draw' : match.entryByUserId.get(engineResult.winner);
  tournamentState.tournamentGameMap.delete(pairingId);
  if (outcome) tournamentManager.recordPairingResult(tournamentId, pairingId, outcome);

  io.in(matchRoom(pairingId)).socketsLeave(matchRoom(pairingId));
}

/**
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function register(io, socket) {
  const user = socket.user;

  function getOwnMatch(pairingId, tournamentId) {
    const match = tournamentState.tournamentGameMap.get(pairingId);
    if (!match || match.tournamentId !== tournamentId) return null;
    if (!match.entryByUserId.has(user.userId)) return null;
    return match;
  }

  // ── tmatch:subscribe ────────────────────────────────────────────────────
  // startMatch()/resyncOnConnect() push tmatch:init automatically for the two
  // participants (match start, socket reconnect), but neither covers a plain
  // page navigation straight to the match URL (tournament.html's "Vào trận"
  // link) — the client has to actively ask for the current state. Also the
  // only way for a SPECTATOR (anyone with the pairingId, not just the two
  // players) to watch a tournament match, matching casual rooms allowing
  // spectators via room:join.
  socket.on('tmatch:subscribe', (payload = {}) => {
    const match = tournamentState.tournamentGameMap.get(payload.pairingId);
    if (!match || match.tournamentId !== payload.tournamentId) {
      socket.emit('tmatch:error', { message: 'Không có ván đấu đang diễn ra.', code: 'NO_ACTIVE_MATCH' });
      return;
    }

    socket.join(matchRoom(payload.pairingId));
    const timer = tournamentState.tournamentTimerMap.get(payload.pairingId);
    socket.emit('tmatch:init', {
      tournamentId: payload.tournamentId,
      pairingId: payload.pairingId,
      ...match.engine.serialize(),
      timer: timer ? timer.getTimers() : null,
      timerSync: timer ? timer.getSync() : null,
    });
  });

  socket.on('tmatch:move', (payload = {}) => {
    const match = getOwnMatch(payload.pairingId, payload.tournamentId);
    if (!match) {
      socket.emit('tmatch:error', { message: 'Không có ván đấu đang diễn ra.', code: 'NO_ACTIVE_MATCH' });
      return;
    }

    const x = parseInt(payload.x, 10);
    const y = parseInt(payload.y, 10);
    if (isNaN(x) || isNaN(y)) {
      socket.emit('tmatch:error', { message: 'Toạ độ không hợp lệ.', code: 'INVALID_COORDS' });
      return;
    }

    const engine = match.engine;
    const result = engine.makeMove(user.userId, x, y);
    if (result.error) {
      socket.emit('tmatch:error', { message: result.error, code: result.code });
      return;
    }

    const timer = tournamentState.tournamentTimerMap.get(payload.pairingId);
    const movePayload = {
      tournamentId: payload.tournamentId,
      pairingId: payload.pairingId,
      x, y,
      color: result.color,
      nextTurn: result.nextTurn,
      moveCount: engine.moveCount,
      timer: timer ? timer.getTimers() : null,
    };

    if (result.won || result.draw) {
      movePayload.gameOver = true;
      movePayload.result = engine.result;
      io.to(matchRoom(payload.pairingId)).emit('tmatch:moved', movePayload);
      io.to(matchRoom(payload.pairingId)).emit('tmatch:ended', {
        tournamentId: payload.tournamentId, pairingId: payload.pairingId, result: engine.result,
      });
      _endMatch(io, payload.tournamentId, payload.pairingId, engine.result);
      return;
    }

    if (timer) {
      const nextEntryId = match.entryByUserId.get(result.nextTurn);
      const pairing = tournamentManager.getPairing(payload.pairingId);
      const nextSlot = pairing && nextEntryId === pairing.player1EntryId ? 'black' : 'white';
      timer.switchTurn(nextSlot);
      movePayload.timer = timer.getTimers();
      movePayload.timerSync = timer.getSync();
    }

    io.to(matchRoom(payload.pairingId)).emit('tmatch:moved', movePayload);
  });

  socket.on('tmatch:swap2_place', (payload = {}) => {
    const match = getOwnMatch(payload.pairingId, payload.tournamentId);
    if (!match || !match.engine.ruleSwap2) {
      socket.emit('tmatch:error', { message: 'Không có ván Swap2 đang diễn ra.', code: 'NO_ACTIVE_SWAP2' });
      return;
    }

    const x = parseInt(payload.x, 10);
    const y = parseInt(payload.y, 10);
    if (isNaN(x) || isNaN(y)) {
      socket.emit('tmatch:error', { message: 'Toạ độ không hợp lệ.', code: 'INVALID_COORDS' });
      return;
    }

    const engine = match.engine;
    const r = engine.placeOpeningStone(user.userId, x, y);
    if (r.error) {
      socket.emit('tmatch:error', { message: r.error, code: r.code });
      return;
    }

    io.to(matchRoom(payload.pairingId)).emit('tmatch:swap2_state', {
      tournamentId: payload.tournamentId,
      pairingId: payload.pairingId,
      board: engine.board,
      moveCount: engine.moveCount,
      moveHistory: engine.moveHistory,
      currentTurn: engine.currentTurn,
      openingPhase: engine.openingPhase,
      swap2: engine.serialize().swap2,
      lastStone: { x: r.x, y: r.y, color: r.color },
      nextColor: r.nextColor,
    });

    if (r.currentTurn !== user.userId) {
      const timer = tournamentState.tournamentTimerMap.get(payload.pairingId);
      const pairing = tournamentManager.getPairing(payload.pairingId);
      if (timer && pairing) {
        const nextEntryId = match.entryByUserId.get(r.currentTurn);
        timer.switchTurn(nextEntryId === pairing.player1EntryId ? 'black' : 'white');
        io.to(matchRoom(payload.pairingId)).emit('tmatch:timer_sync', { pairingId: payload.pairingId, ...timer.getSync() });
      }
    }
  });

  socket.on('tmatch:swap2_choice', (payload = {}) => {
    const match = getOwnMatch(payload.pairingId, payload.tournamentId);
    if (!match || !match.engine.ruleSwap2) {
      socket.emit('tmatch:error', { message: 'Không có ván Swap2 đang diễn ra.', code: 'NO_ACTIVE_SWAP2' });
      return;
    }

    const engine = match.engine;
    const r = engine.swap2Choice(user.userId, payload.choice);
    if (r.error) {
      socket.emit('tmatch:error', { message: r.error, code: r.code });
      return;
    }

    io.to(matchRoom(payload.pairingId)).emit('tmatch:swap2_state', {
      tournamentId: payload.tournamentId,
      pairingId: payload.pairingId,
      board: engine.board,
      moveCount: engine.moveCount,
      moveHistory: engine.moveHistory,
      currentTurn: engine.currentTurn,
      openingPhase: engine.openingPhase,
      swap2: engine.serialize().swap2,
      lastStone: null,
      nextColor: r.done ? null : r.nextColor,
    });

    if (r.done) {
      const timer = tournamentState.tournamentTimerMap.get(payload.pairingId);
      if (timer) io.to(matchRoom(payload.pairingId)).emit('tmatch:timer_sync', { pairingId: payload.pairingId, ...timer.getSync() });
    }
  });

  socket.on('tmatch:resign', (payload = {}) => {
    const match = getOwnMatch(payload.pairingId, payload.tournamentId);
    if (!match) {
      socket.emit('tmatch:error', { message: 'Không có ván đấu đang diễn ra.', code: 'NO_ACTIVE_MATCH' });
      return;
    }

    const result = match.engine.resign(user.userId);
    if (result.error) {
      socket.emit('tmatch:error', { message: result.error, code: result.code });
      return;
    }

    const finalResult = match.engine.result;
    io.to(matchRoom(payload.pairingId)).emit('tmatch:ended', {
      tournamentId: payload.tournamentId, pairingId: payload.pairingId, result: finalResult,
    });
    _endMatch(io, payload.tournamentId, payload.pairingId, finalResult);
  });
}

module.exports = { register, startMatch, resyncOnConnect, matchRoom };
