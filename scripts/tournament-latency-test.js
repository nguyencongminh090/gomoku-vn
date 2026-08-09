'use strict';

/**
 * tournament-latency-test.js — TODO.md #86: measure real click(move)-to-ack
 * latency inside a live 20-player tournament, instead of guessing.
 *
 * Simulates a full round_robin tournament with 20 concurrent players:
 *   create → 20x register → start (round 0 materializes 10 concurrent
 *   pairings) → per pairing: report_time → confirm_time → ready x2
 *   (InProgress) → play MOVES_PER_PAIRING alternating moves, each one
 *   timed from the moment the mover's socket emits 'tmatch:move' to the
 *   moment that SAME socket receives its own 'tmatch:moved' echo back
 *   (exactly the click → ack path TODO.md #86 is investigating).
 *
 * Identity minting reuses the same JWT-signing bypass as
 * scripts/capacity-test/worker.js (same server secret, no real
 * POST /api/auth/guest calls) — this measures the tournament/game socket
 * path, not guest-auth's own rate limiting.
 *
 * DB SAFETY: this script only opens sockets and drives socket events — it
 * does not touch server/db/gomoku.db directly. But every game it plays
 * finishes with a real win/draw, and TournamentMatchHandler DOES persist to
 * the real db (savePairing, tournament_games) on every pairing/game
 * transition. Per CLAUDE.md's Playwright/db-safety rule, the CALLER of this
 * script is responsible for moving server/db/gomoku.db aside and starting a
 * throwaway server before running this, then restoring the real db and
 * killing the throwaway server afterward — this script does not do that
 * itself, since it doesn't start or stop the server.
 *
 * Usage: node scripts/tournament-latency-test.js [--url http://localhost:3000] [--moves 20]
 */

const { io: ioClient } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');

const config = require('../server/config.js');

const argv = process.argv.slice(2);
function argVal(flag, fallback) {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
}

const SERVER_URL = argVal('--url', 'http://localhost:3000');
const PLAYER_COUNT = 20; // TODO.md #86: fixed at 20 per the request — round_robin round 0 = 10 concurrent pairings, no byes.
const MOVES_PER_PAIRING = parseInt(argVal('--moves', '20'), 10);
const BOARD_SIZE = config.DEFAULT_BOARD_SIZE;

function mintToken(displayName) {
  const userId = 'lat_' + randomUUID().slice(0, 8);
  const token = jwt.sign(
    { userId, username: userId, displayName, isGuest: true },
    config.JWT_SECRET,
    { expiresIn: config.JWT_GUEST_EXPIRY }
  );
  return { userId, token, displayName };
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const s = ioClient(SERVER_URL, { auth: { token }, reconnection: false, timeout: 10000 });
    const to = setTimeout(() => { s.close(); reject(new Error('connect timeout')); }, 10000);
    s.on('connect', () => { clearTimeout(to); resolve(s); });
    s.on('connect_error', (err) => { clearTimeout(to); reject(err); });
  });
}

function once(socket, event, timeoutMs) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => { cleanup(); reject(new Error(`timeout waiting for ${event}`)); }, timeoutMs);
    function handler(payload) { cleanup(); resolve(payload); }
    function cleanup() { clearTimeout(to); socket.off(event, handler); }
    socket.on(event, handler);
  });
}

function raceSuccess(socket, successEvent, errorEvents, timeoutMs) {
  const successPromise = once(socket, successEvent, timeoutMs);
  const errorPromises = errorEvents.map((ev) =>
    once(socket, ev, timeoutMs).then((payload) => { throw new Error(`${ev}: ${payload && payload.message} (${payload && payload.code})`); })
  );
  return Promise.race([successPromise, ...errorPromises]);
}

/** Wait for a 'tournament:pairings_patch' broadcast that includes `pairingId` at `state`. */
function waitForPairingState(coordinatorSocket, pairingId, state, timeoutMs) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => { cleanup(); reject(new Error(`timeout waiting for pairing ${pairingId} -> ${state}`)); }, timeoutMs);
    function handler(payload) {
      const match = (payload.pairings || []).find((p) => p.pairingId === pairingId && p.state === state);
      if (match) { cleanup(); resolve(match); }
    }
    function cleanup() { clearTimeout(to); coordinatorSocket.off('tournament:pairings_patch', handler); }
    coordinatorSocket.on('tournament:pairings_patch', handler);
  });
}

function pickEmptyCell(board, boardSize) {
  const empties = [];
  for (let y = 0; y < boardSize; y++) {
    for (let x = 0; x < boardSize; x++) {
      if (board[y][x] === 0) empties.push({ x, y });
    }
  }
  if (empties.length === 0) return null;
  return empties[Math.floor(Math.random() * empties.length)];
}

function percentile(sorted, p) {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

/** Drive one pairing from Negotiating through MOVES_PER_PAIRING moves, timing every move. */
async function playPairing(coordinatorSocket, pairing, socketByUserId, entryUserId) {
  const pairingId = pairing.pairingId;
  const p1UserId = entryUserId.get(pairing.player1EntryId);
  const p2UserId = entryUserId.get(pairing.player2EntryId);
  const s1 = socketByUserId.get(p1UserId);
  const s2 = socketByUserId.get(p2UserId);

  const result = { pairingId, moves: 0, latenciesMs: [], transportSamples: [], errors: [] };

  try {
    // Negotiating -> Reported -> Ready -> InProgress
    s1.emit('tournament:report_time', { tournamentId: pairing.tournamentId, pairingId, proposedTime: new Date().toISOString() });
    await waitForPairingState(coordinatorSocket, pairingId, 'Reported', 10000);

    s2.emit('tournament:confirm_time', { tournamentId: pairing.tournamentId, pairingId });
    await waitForPairingState(coordinatorSocket, pairingId, 'Ready', 10000);

    const init1 = once(s1, 'tmatch:init', 10000);
    const init2 = once(s2, 'tmatch:init', 10000);
    s1.emit('tournament:ready', { tournamentId: pairing.tournamentId, pairingId });
    s2.emit('tournament:ready', { tournamentId: pairing.tournamentId, pairingId });
    const gameState = await init1;
    await init2;

    const board = gameState.board;
    let currentTurn = gameState.currentTurn;
    const byUserId = new Map([[p1UserId, s1], [p2UserId, s2]]);

    for (let i = 0; i < MOVES_PER_PAIRING; i++) {
      const mover = byUserId.get(currentTurn);
      if (!mover) break;
      const cell = pickEmptyCell(board, gameState.boardSize || BOARD_SIZE);
      if (!cell) break;

      const movedPromise = once(mover, 'tmatch:moved', 10000);
      const errorPromise = once(mover, 'tmatch:error', 4000).then((e) => { throw new Error(`${e.code}: ${e.message}`); });

      const transportAtEmit = mover.io.engine && mover.io.engine.transport ? mover.io.engine.transport.name : 'unknown';
      const t0 = performance.now();
      mover.emit('tmatch:move', { tournamentId: pairing.tournamentId, pairingId, x: cell.x, y: cell.y });

      let moved;
      try {
        moved = await Promise.race([movedPromise, errorPromise]);
      } catch (err) {
        result.errors.push(`move#${i}: ${err.message}`);
        break;
      }
      const latencyMs = performance.now() - t0;
      result.latenciesMs.push(latencyMs);
      result.transportSamples.push(transportAtEmit);
      result.moves++;

      board[cell.y][cell.x] = moved.color === 'BLACK' ? 1 : 2;
      if (moved.gameOver || !moved.nextTurn) break;
      currentTurn = moved.nextTurn;
    }
  } catch (err) {
    result.errors.push(err.message);
  }

  return result;
}

async function main() {
  console.log(`TODO.md #86 — tournament latency test: ${PLAYER_COUNT} players, ${MOVES_PER_PAIRING} moves/pairing, server=${SERVER_URL}`);

  const identities = Array.from({ length: PLAYER_COUNT }, (_, i) => mintToken(`LatPlayer${i + 1}`));
  console.log('Connecting sockets...');
  const sockets = [];
  for (const id of identities) {
    const s = await connect(id.token);
    s.user_userId = id.userId; // stash for lookup below (socket.io-client doesn't expose our JWT payload back to us)
    sockets.push(s);
  }
  const socketByUserId = new Map(sockets.map((s, i) => [identities[i].userId, s]));
  const organizer = sockets[0];
  console.log(`Connected ${sockets.length} sockets.`);

  // ── Create + register ─────────────────────────────────────────────────
  organizer.emit('tournament:create', { name: 'Latency Test #86', format: 'round_robin', ruleSet: {} });
  const created = await raceSuccess(organizer, 'tournament:created', ['tournament:error'], 10000);
  const tournamentId = created.tournamentId;
  console.log(`Tournament created: ${tournamentId}`);

  for (const s of sockets) {
    s.emit('tournament:register', { tournamentId });
  }
  await Promise.all(sockets.map((s) => raceSuccess(s, 'tournament:registered', ['tournament:error'], 10000)));
  console.log(`All ${sockets.length} players registered.`);

  // ── Start (round_robin round 0 materializes floor(20/2) = 10 pairings) ──
  const updatedPromise = once(organizer, 'tournament:updated', 10000);
  organizer.emit('tournament:start', { tournamentId });
  await updatedPromise;
  console.log('Tournament started.');

  organizer.emit('tournament:get', { tournamentId });
  const detail = await once(organizer, 'tournament:detail', 10000);
  const entryUserId = new Map(detail.tournament.entries.map((e) => [e.entryId, e.userId]));
  const livePairings = detail.pairings.filter((p) => p.player2EntryId && p.state !== 'Completed');
  console.log(`Round 0: ${livePairings.length} concurrent pairings.`);

  // ── Play all pairings concurrently — this IS the 20-person-tournament load ──
  const t0 = performance.now();
  const results = await Promise.all(
    livePairings.map((p) => playPairing(organizer, { ...p, tournamentId }, socketByUserId, entryUserId))
  );
  const wallMs = performance.now() - t0;

  for (const s of sockets) s.close();

  // ── Aggregate ────────────────────────────────────────────────────────
  const allLatencies = results.flatMap((r) => r.latenciesMs).sort((a, b) => a - b);
  const allErrors = results.flatMap((r) => r.errors.map((e) => `${r.pairingId}: ${e}`));
  const transportCounts = {};
  for (const r of results) for (const t of r.transportSamples) transportCounts[t] = (transportCounts[t] || 0) + 1;

  const summary = {
    ranAt: new Date().toISOString(),
    serverUrl: SERVER_URL,
    playerCount: PLAYER_COUNT,
    pairingCount: livePairings.length,
    movesPerPairingRequested: MOVES_PER_PAIRING,
    totalMovesPlayed: allLatencies.length,
    wallMs: Math.round(wallMs),
    latencyMs: {
      min: allLatencies[0] ?? null,
      p50: percentile(allLatencies, 0.5),
      p90: percentile(allLatencies, 0.9),
      p99: percentile(allLatencies, 0.99),
      max: allLatencies[allLatencies.length - 1] ?? null,
      avg: allLatencies.length ? allLatencies.reduce((a, b) => a + b, 0) / allLatencies.length : null,
    },
    slowMoves: allLatencies.filter((ms) => ms >= 300).length, // "đáng nghi" threshold from docs/instruction/B86
    slowMovesOver1000: allLatencies.filter((ms) => ms >= 1000).length,
    transportCounts,
    errors: allErrors,
    perPairing: results.map((r) => ({
      pairingId: r.pairingId,
      moves: r.moves,
      p50: percentile([...r.latenciesMs].sort((a, b) => a - b), 0.5),
      max: r.latenciesMs.length ? Math.max(...r.latenciesMs) : null,
      errors: r.errors,
    })),
  };

  console.log('\n=== Summary ===');
  console.log(JSON.stringify(summary, null, 2));

  const outPath = path.join(__dirname, '..', 'docs', `tournament-latency-test-${Date.now()}.json`);
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  console.log(`\nWritten to ${outPath}`);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
