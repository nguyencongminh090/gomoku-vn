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
// Reused as-is (TODO.md #50 step 7 "UI/component reuse" — the SAME rule
// applies to the chat mechanism underneath it): managers/ChatHandler.js's
// handleMessage() is already decoupled from RoomManager, it just broadcasts
// to whatever Socket.io room string it's given — passing matchRoom(pairingId)
// scopes it to a tournament match's own room instead of writing a parallel
// rate-limit/sanitize/profanity-filter pipeline from scratch.
const chatManager = require('../../managers/ChatHandler');

const MATCH_ROOM_PREFIX = 'tournament-match:';

function matchRoom(pairingId) {
  return `${MATCH_ROOM_PREFIX}${pairingId}`;
}

/**
 * Spectator/audience list for a live match (TODO.md #50 decision 9 — the
 * ported "Khán giả" tab needs real occupants, not just chrome). Deliberately
 * NOT a hand-rolled Map of who's present — Socket.io's own room membership
 * (io.sockets.adapter.rooms) is already the source of truth and already
 * self-cleans on disconnect, so reading it on demand can never drift out of
 * sync the way a separately-maintained presence Map could.
 *
 * @returns {Array<{userId: string, displayName: string}>} everyone in the
 *   match room who ISN'T one of the two players.
 */
function _getSpectators(io, pairingId) {
  const match = tournamentState.tournamentGameMap.get(pairingId);
  const room = io.sockets.adapter.rooms.get(matchRoom(pairingId));
  if (!match || !room) return [];

  const seen = new Set();
  const spectators = [];
  for (const socketId of room) {
    const sock = io.sockets.sockets.get(socketId);
    if (!sock || !sock.user) continue;
    const userId = sock.user.userId;
    if (match.entryByUserId.has(userId)) continue; // a player, not a spectator
    if (seen.has(userId)) continue; // same user, multiple tabs/sockets
    seen.add(userId);
    spectators.push({ userId, displayName: sock.user.displayName });
  }
  return spectators;
}

function _broadcastPresence(io, pairingId) {
  const spectators = _getSpectators(io, pairingId);
  io.to(matchRoom(pairingId)).emit('tmatch:presence', { pairingId, spectators });
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
 * Series info block (TODO.md #50) attached to every tmatch:init — the
 * pairing's current game index + running score, always present (null-shaped
 * for a plain 'single'-mode pairing) so the client doesn't need two payload
 * shapes. Shared by startMatch, resyncOnConnect, and tmatch:subscribe, since
 * all three emit tmatch:init for a live-or-just-started game and gameIndex
 * means the same thing in each case: how many games in the series are
 * already recorded (the live/about-to-start one isn't pushed until it ends).
 */
function _seriesInfo(tournament, pairing) {
  const ruleSet = tournament.ruleSet;
  return {
    seriesMode: ruleSet.seriesMode,
    gameIndex: pairing.games.length,
    seriesScore: pairing.seriesScore,
    seriesGameCount: ruleSet.seriesGameCount,
    seriesTargetScore: ruleSet.seriesTargetScore,
    seriesMargin: ruleSet.seriesMargin,
  };
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

  // This new game's 0-based index within the pairing's series (TODO.md #50)
  // — equal to how many games are already recorded, since recordPairingResult
  // pushes a game BEFORE looping the pairing back to Ready for the next one.
  // Single-game (non-series) pairings always start at gameIndex 0.
  const gameIndex = pairing.games.length;

  // Color alternates every game in the series (planning.md decision 4) —
  // swap which entry sits in the "first" seat based on gameIndex parity.
  // player1EntryId/player2EntryId themselves stay FIXED as TimerManager's
  // black/white slots (see PairingLifecycle.markReady) and as the
  // entryByUserId/userIdByEntry keys below — only the GameEngine seat
  // (and therefore stone color / Swap2 first-mover) alternates.
  const evenGame = gameIndex % 2 === 0;
  const first = evenGame ? entry1 : entry2;
  const second = evenGame ? entry2 : entry1;

  const engine = new GameEngine({
    roomId: pairingId,
    boardSize: ruleSet.boardSize,
    players: ruleSet.ruleSwap2
      ? [
          { userId: first.userId, displayName: first.displayName, color: null, isGuest: first.isGuest },
          { userId: second.userId, displayName: second.displayName, color: null, isGuest: second.isGuest },
        ]
      : [
          { userId: first.userId, displayName: first.displayName, color: 'BLACK', isGuest: first.isGuest },
          { userId: second.userId, displayName: second.displayName, color: 'WHITE', isGuest: second.isGuest },
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
    // Series info (TODO.md #50) — always present, null-shaped the same way
    // for a plain 1-game ('single' mode) pairing as for an actual series, so
    // the client doesn't need two different payload shapes. This doubles as
    // the "next game in the series has started" transition signal from
    // features/tournament-match-series/diagram/uml_diagram/
    // sequence-match-series-game-transition.md — that diagram's proposed
    // event name is `tmatch:started`, but tmatch:init is the real event this
    // codebase already uses for every "a live GameEngine now exists for this
    // pairing" case (initial start, reconnect resync, subscribe); reusing it
    // here keeps one event instead of two doing the same job.
    series: _seriesInfo(tournament, pairing),
  });
  _broadcastPresence(io, pairingId);
  logger.info(`[TournamentMatch] Match started for pairing ${pairingId} (game ${gameIndex + 1})`);
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
    const tournament = tournamentManager.getTournament(match.tournamentId);
    const pairing = tournamentManager.getPairing(pairingId);
    socket.emit('tmatch:init', {
      tournamentId: match.tournamentId,
      pairingId,
      ...match.engine.serialize(),
      timer: timer ? timer.getTimers() : null,
      timerSync: timer ? timer.getSync() : null,
      series: (tournament && pairing) ? _seriesInfo(tournament, pairing) : null,
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
  _endMatch(io, tournamentId, pairingId, match.engine.result);
}

/**
 * Resolve TournamentManager.recordPairingResult from a finished engine's
 * result, tear down local match state, and emit tmatch:ended — the single
 * place that happens now (TODO.md #50), since whether the match room should
 * stay joined depends on the SERIES outcome (which only recordPairingResult
 * knows), not just this one game's outcome.
 */
function _endMatch(io, tournamentId, pairingId, engineResult) {
  const match = tournamentState.tournamentGameMap.get(pairingId);
  if (!match) return;

  const pairing = tournamentManager.getPairing(pairingId);
  if (pairing) pairing.moves = match.engine.moveHistory;

  const outcome = engineResult.winner === 'draw' ? 'draw' : match.entryByUserId.get(engineResult.winner);
  tournamentState.tournamentGameMap.delete(pairingId);

  // seriesComplete stays true (not just "truthy") for anything that isn't
  // the explicit "loop back to Ready for the next game" signal —
  // recordPairingResult only sets `seriesComplete: false` on that one path;
  // a fully Completed pairing or a double_elim void/replay both count as
  // "this match session is over" from the socket layer's point of view.
  let seriesInfo = null;
  if (outcome) {
    const recordResult = tournamentManager.recordPairingResult(tournamentId, pairingId, outcome);
    const updatedPairing = tournamentManager.getPairing(pairingId);
    seriesInfo = {
      seriesComplete: recordResult.seriesComplete !== false,
      seriesScore: updatedPairing ? updatedPairing.seriesScore : null,
    };
  }

  io.to(matchRoom(pairingId)).emit('tmatch:ended', {
    tournamentId, pairingId, result: engineResult, series: seriesInfo,
  });

  if (!seriesInfo || seriesInfo.seriesComplete) {
    io.in(matchRoom(pairingId)).socketsLeave(matchRoom(pairingId));
  }
  // else: series continues — players/spectators stay in the match room so
  // they receive the next game's tmatch:init once both players re-check-in,
  // without having to re-navigate or re-subscribe.
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
    const tournament = tournamentManager.getTournament(payload.tournamentId);
    const pairing = tournamentManager.getPairing(payload.pairingId);
    socket.emit('tmatch:init', {
      tournamentId: payload.tournamentId,
      pairingId: payload.pairingId,
      ...match.engine.serialize(),
      timer: timer ? timer.getTimers() : null,
      timerSync: timer ? timer.getSync() : null,
      series: (tournament && pairing) ? _seriesInfo(tournament, pairing) : null,
    });
    _broadcastPresence(io, payload.pairingId);
  });

  // ── tmatch:chat_message ─────────────────────────────────────────────────
  // Reuses managers/ChatHandler.js's handleMessage() as-is (rate limit,
  // sanitize, profanity filter) — see the require above for why this is
  // "reuse the mechanism" rather than a parallel chat implementation.
  // Anyone actually in the match room (a player OR a subscribed spectator)
  // may chat, unlike getOwnMatch()'s player-only check above.
  socket.on('tmatch:chat_message', (payload = {}) => {
    if (!socket.rooms.has(matchRoom(payload.pairingId))) {
      socket.emit('tmatch:error', { message: 'Bạn cần vào trận đấu để trò chuyện.', code: 'MUST_BE_IN_MATCH_TO_CHAT' });
      return;
    }
    chatManager.handleMessage(io, socket, matchRoom(payload.pairingId), payload.text || '');
  });

  // ── disconnecting: presence cleanup ─────────────────────────────────────
  // 'disconnecting' (not 'disconnect') fires while socket.rooms is still
  // populated — by 'disconnect' time Socket.io has already emptied it, so
  // there would be no way to know which match room(s) to re-broadcast for.
  // setImmediate lets socket.io finish actually removing this socket from
  // its rooms first, so _getSpectators' room-membership read reflects the
  // departure instead of racing ahead of it.
  socket.on('disconnecting', () => {
    for (const room of socket.rooms) {
      if (!room.startsWith(MATCH_ROOM_PREFIX)) continue;
      const pairingId = room.slice(MATCH_ROOM_PREFIX.length);
      setImmediate(() => _broadcastPresence(io, pairingId));
    }
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
      _endMatch(io, payload.tournamentId, payload.pairingId, engine.result); // emits tmatch:ended itself
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

    _endMatch(io, payload.tournamentId, payload.pairingId, match.engine.result); // emits tmatch:ended itself
  });
}

module.exports = { register, startMatch, resyncOnConnect, matchRoom };
