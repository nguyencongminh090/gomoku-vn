'use strict';

/**
 * GameHandler.js — Socket events for the game domain.
 *
 * Events handled:
 *   game:move          — place a stone
 *   game:swap2_place   — place an opening stone during Swap2
 *   game:swap2_choice  — resolve Swap2 color choice
 *   game:resign        — player resigns
 *   game:draw_offer    — offer a draw
 *   game:draw_accept   — accept a pending draw offer
 *   game:draw_decline  — decline a pending draw offer
 *   game:request_time  — request bonus seconds
 *   game:time_accept   — opponent accepts the time request
 *   game:time_decline  — opponent declines the time request
 *   game:rematch       — request a rematch
 *
 * Exported for use by RoomHandler (startGame / handleGameEnd on room:leave):
 *   startGame(io, room)
 *   handleGameEnd(io, room, opts)
 */

const logger          = require('../../utils/logger');
const roomManager     = require('../../managers/RoomManager');
const { GameEngine }  = require('../../managers/GameEngine');
const TimerManager    = require('../../managers/TimerManager');
const WallGenerator   = require('../../generators/WallGenerator');
const PortalGenerator = require('../../generators/PortalGenerator');
const database        = require('../../db/database');
const config          = require('../../config');
const {
  timerMap,
  broadcastLobbyUpdate,
  cleanupRoomTimer,
  cleanupReadyTimer,
  syncReadyWindow,
} = require('../state');

/**
 * Register game-domain event listeners on a socket.
 *
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function register(io, socket) {
  const user = socket.user;

  // ── game:move ────────────────────────────────────────────────────────────

  socket.on('game:move', (payload = {}) => {
    const room = roomManager.getRoomByUser(user.userId);
    if (!room || !room.gameState) {
      socket.emit('game:error', { message: 'Không có ván đấu đang diễn ra.' });
      return;
    }

    const x = parseInt(payload.x, 10);
    const y = parseInt(payload.y, 10);
    if (isNaN(x) || isNaN(y)) {
      socket.emit('game:error', { message: 'Toạ độ không hợp lệ.' });
      return;
    }

    const engine = room.gameState;
    const result = engine.makeMove(user.userId, x, y);
    if (result.error) {
      socket.emit('game:error', { message: result.error });
      return;
    }

    const timer = timerMap.get(room.roomId);
    // Delta only — the client applies {x,y,color} to its local board cell
    // (client/js/room-socket.js game:moved handler) rather than receiving a
    // full board resync on every move.
    const movePayload = {
      x, y,
      color: result.color,
      nextTurn: result.nextTurn,
      moveCount: engine.moveCount,
      timer: timer ? timer.getTimers() : null,
    };

    if (result.won || result.draw) {
      movePayload.gameOver = true;
      movePayload.result = engine.result;
    } else {
      if (timer) {
        const np = room.gameState.players.find(p => p.userId === result.nextTurn);
        const nextColor = np && np.color === 'BLACK' ? 'black' : 'white';
        timer.switchTurn(nextColor);
        movePayload.timer = timer.getTimers();
      }
    }

    io.to(room.roomId).emit('game:moved', movePayload);
    room.lastActivity = Date.now();

    if (result.won || result.draw) {
      const finalResult = engine.result;
      handleGameEnd(io, room);
      io.to(room.roomId).emit('game:ended', {
        result: finalResult,
        scoreTable: room.scoreTable,
      });
    }
  });

  // ── game:swap2_place ─────────────────────────────────────────────────────

  socket.on('game:swap2_place', (payload = {}) => {
    const room = roomManager.getRoomByUser(user.userId);
    if (!room || !room.gameState || !room.gameState.ruleSwap2) {
      socket.emit('game:error', { message: 'Không có ván Swap2 đang diễn ra.' });
      return;
    }

    const x = parseInt(payload.x, 10);
    const y = parseInt(payload.y, 10);
    if (isNaN(x) || isNaN(y)) {
      socket.emit('game:error', { message: 'Toạ độ không hợp lệ.' });
      return;
    }

    const engine = room.gameState;
    const r = engine.placeOpeningStone(user.userId, x, y);
    if (r.error) {
      socket.emit('game:error', { message: r.error });
      return;
    }

    io.to(room.roomId).emit('game:swap2_state',
      buildSwap2State(engine, { x: r.x, y: r.y, color: r.color }, r.nextColor));
    room.lastActivity = Date.now();
  });

  // ── game:swap2_choice ────────────────────────────────────────────────────

  socket.on('game:swap2_choice', (payload = {}) => {
    const room = roomManager.getRoomByUser(user.userId);
    if (!room || !room.gameState || !room.gameState.ruleSwap2) {
      socket.emit('game:error', { message: 'Không có ván Swap2 đang diễn ra.' });
      return;
    }

    const engine = room.gameState;
    const r = engine.swap2Choice(user.userId, payload.choice);
    if (r.error) {
      socket.emit('game:error', { message: r.error });
      return;
    }

    if (r.done) {
      startTimerForGame(io, room, engine);
      io.to(room.roomId).emit('game:swap2_state', buildSwap2State(engine, null, null));

      const timer = timerMap.get(room.roomId);
      if (timer) io.to(room.roomId).emit('timer:tick', timer.getTimers());

      const whiteP = engine.players.find(p => p.color === 'WHITE');
      io.to(room.roomId).emit('chat:message', {
        from: null, fromId: null,
        text: `Khai cuộc kết thúc! ${whiteP ? whiteP.displayName : '—'} (Trắng) đi trước.`,
        timestamp: Date.now(), isSystem: true,
      });
    } else {
      io.to(room.roomId).emit('game:swap2_state', buildSwap2State(engine, null, r.nextColor));
    }

    room.lastActivity = Date.now();
  });

  // ── game:resign ──────────────────────────────────────────────────────────

  socket.on('game:resign', () => {
    const room = roomManager.getRoomByUser(user.userId);
    if (!room || !room.gameState) {
      socket.emit('game:error', { message: 'Không có ván đấu đang diễn ra.' });
      return;
    }

    const result = room.gameState.resign(user.userId);
    if (result.error) {
      socket.emit('game:error', { message: result.error });
      return;
    }

    const gameResult = room.gameState.result;
    handleGameEnd(io, room);
    io.to(room.roomId).emit('game:ended', {
      result: gameResult,
      scoreTable: room.scoreTable,
    });
    io.to(room.roomId).emit('chat:message', {
      from: null, fromId: null,
      text: `${user.displayName} đã đầu hàng.`,
      timestamp: Date.now(), isSystem: true,
    });
  });

  // ── game:draw_offer ──────────────────────────────────────────────────────

  socket.on('game:draw_offer', () => {
    const room = roomManager.getRoomByUser(user.userId);
    if (!room || !room.gameState) return;

    const result = room.gameState.offerDraw(user.userId);
    if (result.error) {
      socket.emit('game:error', { message: result.error });
      return;
    }

    io.to(room.roomId).emit('game:draw_offered', { from: user.userId, fromName: user.displayName });
    io.to(room.roomId).emit('chat:message', {
      from: null, fromId: null,
      text: `${user.displayName} đề nghị hoà.`,
      timestamp: Date.now(), isSystem: true,
    });
  });

  // ── game:draw_accept ─────────────────────────────────────────────────────

  socket.on('game:draw_accept', () => {
    const room = roomManager.getRoomByUser(user.userId);
    if (!room || !room.gameState) return;

    const result = room.gameState.acceptDraw(user.userId);
    if (result.error) {
      socket.emit('game:error', { message: result.error });
      return;
    }

    const gameResult = room.gameState.result;
    handleGameEnd(io, room);
    io.to(room.roomId).emit('game:ended', {
      result: gameResult,
      scoreTable: room.scoreTable,
    });
    io.to(room.roomId).emit('chat:message', {
      from: null, fromId: null,
      text: 'Hai bên đồng ý hoà.',
      timestamp: Date.now(), isSystem: true,
    });
  });

  // ── game:draw_decline ────────────────────────────────────────────────────

  socket.on('game:draw_decline', () => {
    const room = roomManager.getRoomByUser(user.userId);
    if (!room || !room.gameState) return;

    const result = room.gameState.declineDraw(user.userId);
    if (result.error) {
      socket.emit('game:error', { message: result.error });
      return;
    }

    io.to(room.roomId).emit('game:draw_declined', { by: user.userId });
    io.to(room.roomId).emit('chat:message', {
      from: null, fromId: null,
      text: `${user.displayName} từ chối hoà.`,
      timestamp: Date.now(), isSystem: true,
    });
  });

  // ── game:request_time ────────────────────────────────────────────────────

  socket.on('game:request_time', () => {
    const room = roomManager.getRoomByUser(user.userId);
    if (!room || !room.gameState || room.gameState.status !== 'ongoing') {
      socket.emit('game:error', { message: 'Không có ván đấu đang diễn ra.' });
      return;
    }

    const engine = room.gameState;
    const player = engine.players.find(p => p.userId === user.userId);
    if (!player) {
      socket.emit('game:error', { message: 'Bạn không phải người chơi.' });
      return;
    }

    if (engine.currentTurn !== user.userId) {
      socket.emit('game:error', { message: 'Chỉ được xin thời gian trong lượt của bạn.' });
      return;
    }

    if (room._timeRequestPending) {
      socket.emit('game:error', { message: 'Đang chờ đối thủ phản hồi yêu cầu xin thời gian.' });
      return;
    }

    if (!room._timeRequestsUsed) room._timeRequestsUsed = {};
    const used = room._timeRequestsUsed[user.userId] || 0;

    if (used < config.TIME_REQUEST_FREE) {
      // Auto-grant free request
      room._timeRequestsUsed[user.userId] = used + 1;
      const remaining = config.TIME_REQUEST_FREE - room._timeRequestsUsed[user.userId];

      const timer = timerMap.get(room.roomId);
      if (timer) {
        const color = player.color === 'BLACK' ? 'black' : 'white';
        timer.addTime(color, config.TIME_REQUEST_BONUS);
        io.to(room.roomId).emit('timer:tick', timer.getTimers());
        io.to(room.roomId).emit('chat:message', {
          from: null, fromId: null,
          text: `${user.displayName} đã dùng quyền thêm thời gian tự động (+${config.TIME_REQUEST_BONUS}s). Còn ${remaining} lần.`,
          timestamp: Date.now(), isSystem: true,
        });
      }
      return;
    }

    // Out of free requests — require opponent permission
    room._timeRequestPending = { from: user.userId, fromName: user.displayName, bonus: config.TIME_REQUEST_BONUS };
    io.to(room.roomId).emit('game:time_offered', {
      from: user.userId,
      fromName: user.displayName,
      bonus: config.TIME_REQUEST_BONUS,
    });
    io.to(room.roomId).emit('chat:message', {
      from: null, fromId: null,
      text: `${user.displayName} xin thêm ${config.TIME_REQUEST_BONUS} giây (đã hết lượt tự động).`,
      timestamp: Date.now(), isSystem: true,
    });
  });

  // ── game:time_accept ─────────────────────────────────────────────────────

  socket.on('game:time_accept', () => {
    const room = roomManager.getRoomByUser(user.userId);
    if (!room || !room.gameState || room.gameState.status !== 'ongoing') return;

    if (!room._timeRequestPending) {
      socket.emit('game:error', { message: 'Không có yêu cầu xin thời gian.' });
      return;
    }
    if (room._timeRequestPending.from === user.userId) {
      socket.emit('game:error', { message: 'Bạn không thể tự chấp nhận.' });
      return;
    }

    const requesterId = room._timeRequestPending.from;
    const requester = room.gameState.players.find(p => p.userId === requesterId);
    room._timeRequestPending = null;
    if (!requester) return;

    const timer = timerMap.get(room.roomId);
    if (timer) {
      const color = requester.color === 'BLACK' ? 'black' : 'white';
      timer.addTime(color, config.TIME_REQUEST_BONUS);
      io.to(room.roomId).emit('timer:tick', timer.getTimers());
      io.to(room.roomId).emit('game:time_granted', {
        playerId: requesterId,
        bonus: config.TIME_REQUEST_BONUS,
      });
      io.to(room.roomId).emit('chat:message', {
        from: null, fromId: null,
        text: `${user.displayName} đồng ý cho thêm ${config.TIME_REQUEST_BONUS} giây.`,
        timestamp: Date.now(), isSystem: true,
      });
    }
  });

  // ── game:time_decline ────────────────────────────────────────────────────

  socket.on('game:time_decline', () => {
    const room = roomManager.getRoomByUser(user.userId);
    if (!room || !room.gameState || room.gameState.status !== 'ongoing') return;

    if (!room._timeRequestPending) {
      socket.emit('game:error', { message: 'Không có yêu cầu xin thời gian.' });
      return;
    }
    if (room._timeRequestPending.from === user.userId) {
      socket.emit('game:error', { message: 'Bạn không thể tự từ chối.' });
      return;
    }

    room._timeRequestPending = null;
    io.to(room.roomId).emit('game:time_declined', { by: user.userId });
    io.to(room.roomId).emit('chat:message', {
      from: null, fromId: null,
      text: `${user.displayName} từ chối yêu cầu xin thời gian.`,
      timestamp: Date.now(), isSystem: true,
    });
  });

  // ── game:rematch ─────────────────────────────────────────────────────────

  socket.on('game:rematch', () => {
    const room = roomManager.getRoomByUser(user.userId);
    if (!room) return;

    if (room.state !== 'idle') {
      socket.emit('game:error', { message: 'Phòng đang trong trạng thái không hợp lệ.' });
      return;
    }

    const result = roomManager.confirmStart(user.userId);
    if (result.error) {
      socket.emit('game:error', { message: result.error });
      return;
    }

    if (result.allReady) {
      cleanupReadyTimer(room.roomId);
      result.room.readyDeadline = null;
      io.to(room.roomId).emit('room:updated', roomManager.serializeRoom(result.room));
      startGame(io, result.room);
    } else {
      syncReadyWindow(io, result.room);
      io.to(room.roomId).emit('room:updated', roomManager.serializeRoom(result.room));
    }
  });
}

// =============================================================================
// Game Lifecycle (exported for use by RoomHandler and DisconnectHandler)
// =============================================================================

/**
 * Build and start the per-room timer using the engine's resolved player colors.
 * Shared by normal game start and Swap2 resolution.
 */
function startTimerForGame(io, room, engine) {
  const roomId = room.roomId;
  const settings = room.settings;

  const blackPlayer = engine.players.find(p => p.color === 'BLACK');
  const whitePlayer = engine.players.find(p => p.color === 'WHITE');

  const timer = new TimerManager({
    roomId,
    mode: settings.timerMode,
    seconds: settings.timerSeconds,
    incrementSeconds: settings.timerIncrementSeconds || 0,
    blackPlayerId: blackPlayer.userId,
    whitePlayerId: whitePlayer.userId,
    onTick: (timers) => {
      io.to(roomId).emit('timer:tick', timers);
    },
    onTimeout: (timedOutPlayerId) => {
      engine.handleTimeout(timedOutPlayerId);
      handleGameEnd(io, room);

      const timedOutUser = room.users.get(timedOutPlayerId);
      io.to(roomId).emit('game:ended', {
        result: engine.result,
        scoreTable: room.scoreTable,
      });
      io.to(roomId).emit('chat:message', {
        from: null, fromId: null,
        text: `${timedOutUser ? timedOutUser.displayName : '—'} hết thời gian!`,
        timestamp: Date.now(), isSystem: true,
      });
    },
  });

  timerMap.set(roomId, timer);
  timer.start();
  return timer;
}

/**
 * Build the payload for a game:swap2_state event.
 *
 * Sends the full board/players/swap2 state rather than a delta: the client
 * (client/js/room-socket.js game:swap2_state handler) fully replaces
 * gameState.board and gameState.players from this payload, so trimming it
 * to a delta would require client-side incremental-apply logic. Left as
 * full-state since Swap2 opening only fires 2-3 times per game (low volume)
 * and client changes are out of scope for this backend-only optimization.
 */
function buildSwap2State(engine, lastStone, nextColor) {
  return {
    board: engine.board,
    moveCount: engine.moveCount,
    moveHistory: engine.moveHistory,
    currentTurn: engine.currentTurn,
    openingPhase: engine.openingPhase,
    swap2: engine.serialize().swap2,
    players: engine.players.map(p => ({
      userId: p.userId,
      displayName: p.displayName,
      color: p.color,
    })),
    lastStone,
    nextColor,
  };
}

/**
 * Start a new game when both players are ready.
 *
 * @param {import('socket.io').Server} io
 * @param {object} room — room object from RoomManager
 */
function startGame(io, room) {
  const roomId = room.roomId;
  const settings = room.settings;

  let slot1Player = null, slot2Player = null;
  for (const [, u] of room.users) {
    if (u.slot === 1) slot1Player = u;
    if (u.slot === 2) slot2Player = u;
  }

  if (!slot1Player || !slot2Player) {
    io.to(roomId).emit('game:error', { message: 'Thiếu người chơi.' });
    return;
  }

  // Generate walls and portals (retry loop if placement fails)
  let walls = [], firstMoveZones = [], portals = [];
  let genSuccess = false, attempts = 0;

  while (!genSuccess && attempts < 1000) {
    attempts++;
    walls = []; firstMoveZones = []; portals = [];

    let wSuccess = true;
    if (settings.ruleWall) {
      const wResult = WallGenerator.generate(settings.boardSize);
      if (!wResult) { wSuccess = false; }
      else { walls = wResult.walls; firstMoveZones = wResult.firstMoveZones; }
    }
    if (!wSuccess) continue;

    let pSuccess = true;
    if (settings.rulePortal) {
      const pResult = PortalGenerator.generate(settings.boardSize, walls);
      if (!pResult) { pSuccess = false; }
      else { portals = pResult.portals; }
    }
    if (!pSuccess) continue;

    genSuccess = true;
  }

  if (!genSuccess) {
    io.to(roomId).emit('game:error', {
      message: 'Không thể tạo bản đồ hợp lệ (quá nhiều ràng buộc). Vui lòng tắt bớt tuỳ chọn hoặc thử lại.',
    });
    return;
  }

  // Auto color alternation for fairness
  if (!room.gameCount) room.gameCount = 0;
  room.gameCount++;
  const swapColors = (room.gameCount % 2 === 0);
  const blackPlayer = swapColors ? slot2Player : slot1Player;
  const whitePlayer = swapColors ? slot1Player : slot2Player;

  // ── Swap2 branch ─────────────────────────────────────────────────────────
  if (settings.ruleSwap2) {
    const engine = new GameEngine({
      roomId,
      boardSize: settings.boardSize,
      players: [
        { userId: blackPlayer.userId, displayName: blackPlayer.displayName, color: null },
        { userId: whitePlayer.userId, displayName: whitePlayer.displayName, color: null },
      ],
      walls, portals, firstMoveZones,
      winningRule: settings.winningRule,
      ruleSwap2: true,
    });

    room.gameState = engine;
    room.state = 'playing';
    room._timeRequestsUsed = {};
    room._timeRequestPending = null;
    for (const [, u] of room.users) u.ready = false;

    io.to(roomId).emit('game:init', { ...engine.serialize(), timer: null });
    io.to(roomId).emit('room:updated', roomManager.serializeRoom(room));
    broadcastLobbyUpdate(io);
    io.to(roomId).emit('chat:message', {
      from: null, fromId: null,
      text: `Swap2: ${blackPlayer.displayName} đặt 3 quân mở màn.`,
      timestamp: Date.now(), isSystem: true,
    });
    logger.info(`[Game] Swap2 opening started in room ${roomId}`);
    return;
  }

  // ── Normal game branch ────────────────────────────────────────────────────
  const engine = new GameEngine({
    roomId,
    boardSize: settings.boardSize,
    players: [
      { userId: blackPlayer.userId, displayName: blackPlayer.displayName, color: 'BLACK' },
      { userId: whitePlayer.userId, displayName: whitePlayer.displayName, color: 'WHITE' },
    ],
    walls, portals, firstMoveZones,
    winningRule: settings.winningRule,
  });

  room.gameState = engine;
  room.state = 'playing';
  room._timeRequestsUsed = {};
  room._timeRequestPending = null;
  for (const [, u] of room.users) u.ready = false;

  const timer = startTimerForGame(io, room, engine);

  // Full state, not a delta — game:init is the one-time initial sync each
  // client needs to build its board from scratch; there is no prior client
  // state for a delta to apply against.
  io.to(roomId).emit('game:init', { ...engine.serialize(), timer: timer.getTimers() });
  io.to(roomId).emit('room:updated', roomManager.serializeRoom(room));
  broadcastLobbyUpdate(io);
  io.to(roomId).emit('chat:message', {
    from: null, fromId: null,
    text: 'Ván đấu bắt đầu! Đen đi trước.',
    timestamp: Date.now(), isSystem: true,
  });
  logger.info(`[Game] Game started in room ${roomId}`);
}

/**
 * Handle game end — stop timer, update scores, persist game, reset room state.
 *
 * @param {import('socket.io').Server} io
 * @param {object} room
 * @param {{ noScore?: boolean }} opts
 */
function handleGameEnd(io, room, opts = {}) {
  const roomId = room.roomId;
  const engine = room.gameState;
  const noScore = opts.noScore || false;

  cleanupRoomTimer(roomId);
  cleanupReadyTimer(roomId);

  if (engine && engine.result && !noScore) {
    const { winner } = engine.result;
    for (const p of engine.players) {
      if (!room.scoreTable[p.userId]) {
        room.scoreTable[p.userId] = { name: p.displayName, win: 0, loss: 0, draw: 0 };
      }
      if (winner === 'draw') {
        room.scoreTable[p.userId].draw++;
      } else if (winner === p.userId) {
        room.scoreTable[p.userId].win++;
      } else {
        room.scoreTable[p.userId].loss++;
      }
    }
  }

  // Persist game to SQLite
  if (engine && engine.result) {
    try {
      database.saveGame({
        gameId: engine.gameId,
        roomId: engine.roomId,
        players: engine.players.map(p => ({
          id: p.userId,
          name: p.displayName,
          color: p.color,
          isGuest: false,
        })),
        result: engine.result,
        boardSize: engine.boardSize,
        ruleWall: engine.walls.length > 0,
        rulePortal: engine.portals.length > 0,
        moveHistory: engine.moveHistory,
        walls: engine.walls,
        portals: engine.portals,
        startedAt: engine.moveHistory.length > 0
          ? new Date(engine.moveHistory[0].timestamp).toISOString()
          : new Date().toISOString(),
        endedAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn('[Game] Failed to persist game:', err.message);
    }
  }

  room.state = 'idle';
  room.gameState = null;
  room._timeRequestPending = null;
  for (const [, u] of room.users) u.ready = false;

  io.to(roomId).emit('room:updated', roomManager.serializeRoom(room));
  broadcastLobbyUpdate(io);
}

module.exports = { register, startGame, handleGameEnd };
