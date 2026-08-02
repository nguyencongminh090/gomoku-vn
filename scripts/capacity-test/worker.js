'use strict';

/**
 * capacity-test/worker.js — one OS process, driving a slice of the total
 * rooms for a capacity-test run. Forked by orchestrator.js (never run
 * directly). See scripts/capacity-test/README.md for why this is a separate
 * process per worker rather than one process opening every socket (a single
 * Node event loop generating thousands of connections is itself a bottleneck
 * that was shown to distort earlier one-off measurements — see
 * docs/stress-test-report.md and TODO.md #7/#26).
 *
 * Identities are minted JWTs signed with the server's own secret (same
 * bypass used in e2e/flood-protection.spec.ts) rather than real
 * POST /api/auth/guest calls — this harness measures room/game socket
 * capacity, not the guest-auth endpoint's own rate limiting (that's a
 * separate, already-covered concern).
 */

const { io: ioClient } = require('socket.io-client');
const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');

const cfg = JSON.parse(process.env.CAPACITY_WORKER_CONFIG);
const config = require('../../server/config.js');

function mintToken(displayName) {
  const userId = 'cap_' + randomUUID().slice(0, 8);
  const token = jwt.sign(
    { userId, username: userId, displayName, isGuest: true },
    config.JWT_SECRET,
    { expiresIn: config.JWT_GUEST_EXPIRY }
  );
  return { userId, token };
}

function connect(token) {
  return new Promise((resolve, reject) => {
    // `default` leaves socket.io's own default of ['polling','websocket'] —
    // an HTTP long-polling handshake that then upgrades. Any other value is a
    // comma-separated transport list tried in order (e.g. `websocket`, or
    // `websocket,polling` for websocket-first-with-fallback). This is the A/B
    // knob for the connection-burst ceiling measured in
    // docs/stress-test-report.md §10.
    const opts = { auth: { token }, reconnection: false, timeout: 10000 };
    if (cfg.transport && cfg.transport !== 'default') {
      opts.transports = String(cfg.transport).split(',');
      // socket.io-client >=4.8: without this, a failed FIRST transport is
      // fatal instead of falling through to the next one in the list.
      opts.tryAllTransports = true;
    }
    const s = ioClient(cfg.serverUrl, opts);
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

// Waits for a success event, but also races against the socket's error
// event(s) (e.g. room:error / game:error) so a server-side rejection (quota
// exceeded, invalid move, ...) surfaces as its real message instead of
// masquerading as a plain "timeout waiting for X" once the success event
// never arrives.
function raceSuccess(socket, successEvent, errorEvents, timeoutMs) {
  const successPromise = once(socket, successEvent, timeoutMs);
  const errorPromises = errorEvents.map((ev) =>
    once(socket, ev, timeoutMs).then((payload) => { throw new Error(`${ev}: ${payload && payload.message}`); })
  );
  return Promise.race([successPromise, ...errorPromises]);
}

async function leaveAndClose(socket) {
  if (!socket || socket.disconnected) return;
  const left = once(socket, 'room:left', 3000).catch(() => {});
  socket.emit('room:leave');
  await left;
  socket.close();
}

function randomDelay() {
  return cfg.moveDelayMinMs + Math.random() * (cfg.moveDelayMaxMs - cfg.moveDelayMinMs);
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

async function playOneRoom(roomIndex) {
  const result = {
    roomIndex,
    created: false,
    joined: false,
    gameStarted: false,
    moves: 0,
    latenciesMs: [],
    errors: [],
  };

  let host, guest;
  try {
    const hostId = mintToken('CapHost');
    const guestId = mintToken('CapGuest');
    host = await connect(hostId.token);
    guest = await connect(guestId.token);

    host.emit('room:create', {});
    const joined = await raceSuccess(host, 'room:joined', ['room:error'], 10000);
    result.created = true;
    const roomId = joined.roomId;

    guest.emit('room:join', { roomId });
    await raceSuccess(guest, 'room:joined', ['room:error'], 10000);
    result.joined = true;

    host.emit('room:sit', { slot: 1 });
    guest.emit('room:sit', { slot: 2 });
    await new Promise((r) => setTimeout(r, 300)); // let room:updated settle before ready

    const hostInit = raceSuccess(host, 'game:init', ['room:error'], 15000);
    host.emit('room:ready');
    guest.emit('room:ready');
    const init = await hostInit;
    result.gameStarted = true;

    const board = init.board;
    const boardSize = init.boardSize;
    let currentTurn = init.currentTurn;
    // engine.players order is [BLACK, WHITE], not necessarily [host, guest]
    // (RoomManager may swap colors) — map by the userIds we minted, not by
    // array position.
    const bySeat = { [hostId.userId]: host, [guestId.userId]: guest };

    for (let i = 0; i < cfg.maxMovesPerGame; i++) {
      const mover = bySeat[currentTurn];
      if (!mover) break; // shouldn't happen; bail rather than hang
      const cell = pickEmptyCell(board, boardSize);
      if (!cell) break; // board full

      // game:moved is a room-wide broadcast — the mover's own socket
      // receives it too, no need to listen on the other player's socket.
      const movedPromise = once(mover, 'game:moved', 10000);
      const errorPromise = once(mover, 'game:error', 4000).then((e) => { throw new Error(e.message); });

      const t0 = Date.now();
      mover.emit('game:move', cell);
      let moved;
      try {
        moved = await Promise.race([movedPromise, errorPromise]);
      } catch (err) {
        result.errors.push(`move#${i}: ${err.message}`);
        break;
      }
      result.latenciesMs.push(Date.now() - t0);
      result.moves++;

      board[cell.y][cell.x] = moved.color === 'BLACK' ? 1 : 2;
      if (moved.gameOver || !moved.nextTurn) break;
      currentTurn = moved.nextTurn;

      await new Promise((r) => setTimeout(r, randomDelay()));
    }
  } catch (err) {
    result.errors.push(err.message);
  } finally {
    // Explicit room:leave (acked by room:left) frees the room/quota
    // immediately; a bare socket close instead leaves the room held for
    // DISCONNECT_GRACE_MS (60s, server/config.js) to allow reconnect, which
    // would otherwise make the per-IP room quota (MAX_ROOMS_PER_IP) linger
    // across consecutive runs of this harness on the same test machine.
    await Promise.all([leaveAndClose(host), leaveAndClose(guest)]);
  }

  return result;
}

async function main() {
  // All of this worker's assigned rooms run concurrently, not sequentially —
  // the whole point of a concurrency test is N rooms actually live at once.
  // A sequential loop here would silently cap true concurrency at
  // `--workers`, regardless of `--rooms`.
  const results = await Promise.all(
    Array.from({ length: cfg.roomsToCreate }, (_, i) => playOneRoom(i))
  );
  process.send({ workerId: cfg.workerId, results });
  process.exit(0);
}

main();
