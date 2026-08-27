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
 *
 * No separate rematch event: game end resets both seats to not-ready (same
 * as a brand new seat pair) and the normal Start-modal flow (RoomHandler's
 * room:ready) runs again from scratch — see instruction.md §B36.
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
  broadcastRoomUpdate,
  cleanupRoomTimer,
  cleanupReadyTimer,
  buildRoomStatePayload,
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

  socket.on('game:move', (payload = {}, ack) => {
    // `ack` is undefined for any client still running the pre-#152 bundle —
    // a bare `emit('game:move', {x,y})` passes no callback, and calling
    // undefined here would throw inside the handler and break that player's
    // game. That window stays open for as long as a stale `?v=` is cached,
    // so this guard is load-bearing, not defensive.
    const hasAck = typeof ack === 'function';
    // With an ack the rejection travels back on the ack itself; emitting
    // game:error too would show the same refusal twice in the chat log.
    const fail = (message, code) => {
      if (hasAck) ack({ error: message, code });
      else socket.emit('game:error', { message, code });
    };

    const room = roomManager.getRoomByUser(user.userId);
    if (!room || !room.gameState) {
      fail('Không có ván đấu đang diễn ra.', 'NO_ACTIVE_GAME');
      return;
    }

    // Idempotency key, client-generated (TODO.md #152). The dangerous case is
    // a move that *reached* the server and was applied, whose ack was lost on
    // the way back: the client times out and retries, and without this the
    // retry comes back as CELL_OCCUPIED — an error for a move that actually
    // succeeded. Keyed on the identity of the action rather than on matching
    // its content against the last move in history, because history position
    // shifts the moment the opponent slips a move in between.
    const moveId = typeof payload.moveId === 'string' && payload.moveId ? payload.moveId : null;
    if (moveId && room._moveAcks && room._moveAcks.has(moveId)) {
      const prev = room._moveAcks.get(moveId);
      // Replay to the retrying socket only. The opponent already received the
      // original broadcast; re-broadcasting would hand them a moveCount that
      // has gone backwards, which their gap check reads as a desync.
      socket.emit('game:moved', prev);
      if (hasAck) ack({ ok: true, moveCount: prev.moveCount, duplicate: true });
      return;
    }

    const x = parseInt(payload.x, 10);
    const y = parseInt(payload.y, 10);
    if (isNaN(x) || isNaN(y)) {
      fail('Toạ độ không hợp lệ.', 'INVALID_COORDS');
      return;
    }

    const engine = room.gameState;
    // Captured before makeMove(), which auto-cancels the mover's own
    // pending undo offer (GameEngine.js) — the client needs to know so it
    // can clear a stale accept/decline prompt (TODO.md #128).
    const hadOwnUndoOffer = !!(engine.undoOffer && engine.undoOffer.from === user.userId);
    const result = engine.makeMove(user.userId, x, y);
    if (result.error) {
      fail(result.error, result.code);
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
    if (hadOwnUndoOffer) movePayload.undoCancelled = true;

    if (result.won || result.draw) {
      movePayload.gameOver = true;
      movePayload.result = engine.result;
    } else {
      if (timer) {
        const np = room.gameState.players.find(p => p.userId === result.nextTurn);
        const nextColor = np && np.color === 'BLACK' ? 'black' : 'white';
        timer.switchTurn(nextColor);
        movePayload.timer = timer.getTimers();
        // Ride along on the move rather than sending a separate timer event:
        // the turn switch is exactly when the clock changes, so this costs no
        // extra packet per move.
        movePayload.timerSync = timer.getSync();
      }
    }

    // Remember this move under its idempotency key before answering, so a
    // retry arriving while the ack is still in flight replays instead of
    // being treated as a new move. Only successful moves are recorded, which
    // bounds the map at one entry per move of the game; handleGameEnd() drops
    // it so a new game never inherits the previous game's ids.
    if (moveId) {
      if (!room._moveAcks) room._moveAcks = new Map();
      room._moveAcks.set(moveId, movePayload);
    }

    // Broadcast first, ack second: if the ack is the packet that gets lost,
    // the mover still has the game:moved path to learn its move landed. Two
    // independent routes, so losing one is survivable.
    io.to(room.roomId).emit('game:moved', movePayload);
    if (hasAck) ack({ ok: true, moveCount: movePayload.moveCount });
    room.lastActivity = Date.now();

    if (result.won || result.draw) {
      const finalResult = engine.result;
      handleGameEnd(io, room);
      io.to(room.roomId).emit('game:ended', {
        result: finalResult,
        scoreTable: room.scoreTable,
      });
      // Board-full draw has no dedicated modal any more (instruction.md
      // §B36 removed #game-overlay) — this system-chat line is now the only
      // announcement of it, matching the wording already used for an agreed
      // draw (game:draw_accept below).
      if (result.draw) {
        io.to(room.roomId).emit('chat:message', {
          from: null, fromId: null,
          text: 'Ván đấu hoà do bàn cờ đã đầy.',
          code: 'GAME_DRAW_BOARD_FULL',
          timestamp: Date.now(), isSystem: true,
        });
      }
    }
  });

  // ── game:resync ──────────────────────────────────────────────────────────

  // Client-pull recovery (TODO.md #152). Every other resync path in the app
  // is server-push and only fires on a real disconnect→reconnect; selective
  // packet loss that drops a game:move or a game:moved without killing the
  // socket triggers none of them, and the board then sits frozen forever with
  // no way out but F5. This is the escape hatch: the client asks for the
  // authoritative state whenever it can tell it has fallen behind.
  //
  // Deliberately re-emits `room:joined` with the very same payload the
  // reconnect path builds (buildRoomStatePayload), so there is exactly one
  // state-rebuild path on the client instead of two that can drift.
  socket.on('game:resync', () => {
    const room = roomManager.getRoomByUser(user.userId);
    // Not in a room: nothing to resync, and nothing to fail loudly about
    // either — a stale timer firing after the player left is expected.
    if (!room) return;
    socket.emit('room:joined', buildRoomStatePayload(room));
  });

  // ── game:swap2_place ─────────────────────────────────────────────────────

  socket.on('game:swap2_place', (payload = {}) => {
    const room = roomManager.getRoomByUser(user.userId);
    if (!room || !room.gameState || !room.gameState.ruleSwap2) {
      socket.emit('game:error', { message: 'Không có ván Swap2 đang diễn ra.', code: 'NO_ACTIVE_SWAP2' });
      return;
    }

    const x = parseInt(payload.x, 10);
    const y = parseInt(payload.y, 10);
    if (isNaN(x) || isNaN(y)) {
      socket.emit('game:error', { message: 'Toạ độ không hợp lệ.', code: 'INVALID_COORDS' });
      return;
    }

    const engine = room.gameState;
    const hadOwnUndoOffer = !!(engine.undoOffer && engine.undoOffer.from === user.userId);
    const r = engine.placeOpeningStone(user.userId, x, y);
    if (r.error) {
      socket.emit('game:error', { message: r.error, code: r.code });
      return;
    }

    const swap2State = buildSwap2State(engine, { x: r.x, y: r.y, color: r.color }, r.nextColor);
    if (hadOwnUndoOffer) swap2State.undoCancelled = true;
    io.to(room.roomId).emit('game:swap2_state', swap2State);

    // Phase boundary (place3 → p2choice, or place2 → p1choice) hands the turn
    // to the other placeholder player — sync the timer to match.
    if (r.currentTurn !== user.userId) {
      const timer = timerMap.get(room.roomId);
      if (timer) {
        timer.switchTurn(r.currentTurn === engine.secondPlayerId ? 'white' : 'black');
        io.to(room.roomId).emit('timer:sync', timer.getSync());
      }
    }

    room.lastActivity = Date.now();
  });

  // ── game:swap2_choice ────────────────────────────────────────────────────

  socket.on('game:swap2_choice', (payload = {}) => {
    const room = roomManager.getRoomByUser(user.userId);
    if (!room || !room.gameState || !room.gameState.ruleSwap2) {
      socket.emit('game:error', { message: 'Không có ván Swap2 đang diễn ra.', code: 'NO_ACTIVE_SWAP2' });
      return;
    }

    const engine = room.gameState;
    const hadOwnUndoOffer = !!(engine.undoOffer && engine.undoOffer.from === user.userId);
    const r = engine.swap2Choice(user.userId, payload.choice);
    if (r.error) {
      socket.emit('game:error', { message: r.error, code: r.code });
      return;
    }

    if (r.done) {
      // Colors are resolved now — remap the timer's placeholder black/white
      // slots to the real colors in place, rather than creating a fresh
      // TimerManager (which would discard time already spent during the
      // opening). See instruction.md §B37.
      const timer = timerMap.get(room.roomId);
      if (timer) {
        const blackPlayer = engine.players.find(p => p.color === 'BLACK');
        const whitePlayer = engine.players.find(p => p.color === 'WHITE');
        timer.remapForSwap2(blackPlayer.userId, whitePlayer.userId);
      }
      const swap2State = buildSwap2State(engine, null, null);
      if (hadOwnUndoOffer) swap2State.undoCancelled = true;
      io.to(room.roomId).emit('game:swap2_state', swap2State);

      if (timer) io.to(room.roomId).emit('timer:sync', timer.getSync());

      const whiteP = engine.players.find(p => p.color === 'WHITE');
      io.to(room.roomId).emit('chat:message', {
        from: null, fromId: null,
        text: `Khai cuộc kết thúc! ${whiteP ? whiteP.displayName : '—'} (Trắng) đi trước.`,
        code: 'SWAP2_OPENING_DONE', vars: { name: whiteP ? whiteP.displayName : '—' },
        timestamp: Date.now(), isSystem: true,
      });
    } else {
      const swap2State = buildSwap2State(engine, null, r.nextColor);
      if (hadOwnUndoOffer) swap2State.undoCancelled = true;
      io.to(room.roomId).emit('game:swap2_state', swap2State);
    }

    room.lastActivity = Date.now();
  });

  // ── game:resign ──────────────────────────────────────────────────────────

  socket.on('game:resign', () => {
    const room = roomManager.getRoomByUser(user.userId);
    if (!room || !room.gameState) {
      socket.emit('game:error', { message: 'Không có ván đấu đang diễn ra.', code: 'NO_ACTIVE_GAME' });
      return;
    }

    const result = room.gameState.resign(user.userId);
    if (result.error) {
      socket.emit('game:error', { message: result.error, code: result.code });
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
      code: 'GAME_RESIGNED', vars: { name: user.displayName },
      timestamp: Date.now(), isSystem: true,
    });
  });

  // ── game:draw_offer ──────────────────────────────────────────────────────

  socket.on('game:draw_offer', () => {
    const room = roomManager.getRoomByUser(user.userId);
    if (!room || !room.gameState) return;

    const result = room.gameState.offerDraw(user.userId);
    if (result.error) {
      socket.emit('game:error', { message: result.error, code: result.code });
      return;
    }

    io.to(room.roomId).emit('game:draw_offered', { from: user.userId, fromName: user.displayName });
    io.to(room.roomId).emit('chat:message', {
      from: null, fromId: null,
      text: `${user.displayName} đề nghị hoà.`,
      code: 'GAME_DRAW_OFFERED', vars: { name: user.displayName },
      timestamp: Date.now(), isSystem: true,
    });
  });

  // ── game:draw_accept ─────────────────────────────────────────────────────

  socket.on('game:draw_accept', () => {
    const room = roomManager.getRoomByUser(user.userId);
    if (!room || !room.gameState) return;

    const result = room.gameState.acceptDraw(user.userId);
    if (result.error) {
      socket.emit('game:error', { message: result.error, code: result.code });
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
      text: 'Ván đấu hoà theo thoả thuận.',
      code: 'GAME_DRAW_AGREED',
      timestamp: Date.now(), isSystem: true,
    });
  });

  // ── game:draw_decline ────────────────────────────────────────────────────

  socket.on('game:draw_decline', () => {
    const room = roomManager.getRoomByUser(user.userId);
    if (!room || !room.gameState) return;

    const result = room.gameState.declineDraw(user.userId);
    if (result.error) {
      socket.emit('game:error', { message: result.error, code: result.code });
      return;
    }

    io.to(room.roomId).emit('game:draw_declined', { by: user.userId });
    io.to(room.roomId).emit('chat:message', {
      from: null, fromId: null,
      text: `${user.displayName} từ chối hoà.`,
      code: 'GAME_DRAW_DECLINED', vars: { name: user.displayName },
      timestamp: Date.now(), isSystem: true,
    });
  });

  // ── game:undo_request ────────────────────────────────────────────────────
  // TODO.md #128 / docs/instruction/B128-*.md. Unlike draw offers, Undo
  // doesn't block gameplay — both players may keep moving while a request
  // is pending (GameEngine handles the non-blocking/auto-cancel rules).

  socket.on('game:undo_request', () => {
    const room = roomManager.getRoomByUser(user.userId);
    if (!room || !room.gameState) {
      socket.emit('game:error', { message: 'Không có ván đấu đang diễn ra.', code: 'NO_ACTIVE_GAME' });
      return;
    }

    const result = room.gameState.requestUndo(user.userId);
    if (result.error) {
      socket.emit('game:error', { message: result.error, code: result.code });
      return;
    }

    io.to(room.roomId).emit('game:undo_offered', { from: user.userId, fromName: user.displayName });
    io.to(room.roomId).emit('chat:message', {
      from: null, fromId: null,
      text: `${user.displayName} xin đi lại.`,
      code: 'GAME_UNDO_REQUESTED', vars: { name: user.displayName },
      timestamp: Date.now(), isSystem: true,
    });
  });

  // ── game:undo_accept ─────────────────────────────────────────────────────

  socket.on('game:undo_accept', () => {
    const room = roomManager.getRoomByUser(user.userId);
    if (!room || !room.gameState) return;

    const engine = room.gameState;
    const requesterId = engine.undoOffer ? engine.undoOffer.from : null;
    const result = engine.acceptUndo(user.userId);
    if (result.error) {
      socket.emit('game:error', { message: result.error, code: result.code });
      return;
    }

    const timer = timerMap.get(room.roomId);

    if (result.mode === 'opening') {
      if (timer) {
        // Reversing the choice that assigned final colors — remap the
        // timer's black/white slots back to the firstPlayerId/secondPlayerId
        // placeholders used throughout the opening (mirrors the forward
        // remapForSwap2() call in the game:swap2_choice handler above).
        if (engine.colorsAssigned === false) {
          timer.remapForSwap2(engine.firstPlayerId, engine.secondPlayerId);
        }
        timer.switchTurn(result.currentTurn === engine.secondPlayerId ? 'white' : 'black');
        io.to(room.roomId).emit('timer:sync', timer.getSync());
      }
      const swap2State = buildSwap2State(engine, null, result.nextColor);
      // Reuse the client's existing undoCancelled-clears-the-popup path
      // (room-socket.js game:swap2_state handler) — without this flag the
      // accepted offer never gets a signal to clear, and the undo popup
      // stays stuck forever even though the rollback itself applied
      // correctly (TODO.md #156).
      swap2State.undoCancelled = true;
      io.to(room.roomId).emit('game:swap2_state', swap2State);
    } else {
      if (timer) {
        const requesterPlayer = engine.players.find(p => p.userId === requesterId);
        const requesterColor = requesterPlayer && requesterPlayer.color === 'BLACK' ? 'black' : 'white';
        timer.switchTurn(requesterColor);
        io.to(room.roomId).emit('timer:sync', timer.getSync());
      }
      io.to(room.roomId).emit('game:undo_applied', {
        cleared: result.cleared,
        currentTurn: result.currentTurn,
        moveCount: result.moveCount,
      });
    }

    io.to(room.roomId).emit('chat:message', {
      from: null, fromId: null,
      text: `${user.displayName} đồng ý đi lại.`,
      code: 'GAME_UNDO_ACCEPTED', vars: { name: user.displayName },
      timestamp: Date.now(), isSystem: true,
    });
    room.lastActivity = Date.now();
  });

  // ── game:undo_decline ────────────────────────────────────────────────────

  socket.on('game:undo_decline', () => {
    const room = roomManager.getRoomByUser(user.userId);
    if (!room || !room.gameState) return;

    const result = room.gameState.declineUndo(user.userId);
    if (result.error) {
      socket.emit('game:error', { message: result.error, code: result.code });
      return;
    }

    io.to(room.roomId).emit('game:undo_declined', { by: user.userId });
    io.to(room.roomId).emit('chat:message', {
      from: null, fromId: null,
      text: `${user.displayName} từ chối đi lại.`,
      code: 'GAME_UNDO_DECLINED', vars: { name: user.displayName },
      timestamp: Date.now(), isSystem: true,
    });
  });

  // ── game:request_time ────────────────────────────────────────────────────

  socket.on('game:request_time', () => {
    const room = roomManager.getRoomByUser(user.userId);
    if (!room || !room.gameState || room.gameState.status !== 'ongoing') {
      socket.emit('game:error', { message: 'Không có ván đấu đang diễn ra.', code: 'NO_ACTIVE_GAME' });
      return;
    }

    const engine = room.gameState;
    const player = engine.players.find(p => p.userId === user.userId);
    if (!player) {
      socket.emit('game:error', { message: 'Bạn không phải người chơi.', code: 'NOT_A_PLAYER' });
      return;
    }

    if (engine.currentTurn !== user.userId) {
      socket.emit('game:error', { message: 'Chỉ được xin thời gian trong lượt của bạn.', code: 'TIME_REQUEST_ONLY_ON_YOUR_TURN' });
      return;
    }

    if (room._timeRequestPending) {
      socket.emit('game:error', { message: 'Đang chờ đối thủ phản hồi yêu cầu xin thời gian.', code: 'TIME_REQUEST_PENDING' });
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
        io.to(room.roomId).emit('timer:sync', timer.getSync());
        io.to(room.roomId).emit('chat:message', {
          from: null, fromId: null,
          text: `${user.displayName} đã dùng quyền thêm thời gian tự động (+${config.TIME_REQUEST_BONUS}s). Còn ${remaining} lần.`,
          code: 'GAME_TIME_AUTO_BONUS', vars: { name: user.displayName, bonus: config.TIME_REQUEST_BONUS, remaining },
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
      code: 'GAME_TIME_REQUESTED_MANUAL', vars: { name: user.displayName, bonus: config.TIME_REQUEST_BONUS },
      timestamp: Date.now(), isSystem: true,
    });
  });

  // ── game:time_accept ─────────────────────────────────────────────────────

  socket.on('game:time_accept', () => {
    const room = roomManager.getRoomByUser(user.userId);
    if (!room || !room.gameState || room.gameState.status !== 'ongoing') return;

    const player = room.gameState.players.find(p => p.userId === user.userId);
    if (!player) {
      socket.emit('game:error', { message: 'Bạn không phải người chơi.', code: 'NOT_A_PLAYER' });
      return;
    }

    if (!room._timeRequestPending) {
      socket.emit('game:error', { message: 'Không có yêu cầu xin thời gian.', code: 'NO_TIME_REQUEST' });
      return;
    }
    if (room._timeRequestPending.from === user.userId) {
      socket.emit('game:error', { message: 'Bạn không thể tự chấp nhận.', code: 'CANNOT_SELF_ACCEPT' });
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
      io.to(room.roomId).emit('timer:sync', timer.getSync());
      io.to(room.roomId).emit('game:time_granted', {
        playerId: requesterId,
        bonus: config.TIME_REQUEST_BONUS,
      });
      io.to(room.roomId).emit('chat:message', {
        from: null, fromId: null,
        text: `${user.displayName} đồng ý cho thêm ${config.TIME_REQUEST_BONUS} giây.`,
        code: 'GAME_TIME_ACCEPTED', vars: { name: user.displayName, bonus: config.TIME_REQUEST_BONUS },
        timestamp: Date.now(), isSystem: true,
      });
    }
  });

  // ── game:time_decline ────────────────────────────────────────────────────

  socket.on('game:time_decline', () => {
    const room = roomManager.getRoomByUser(user.userId);
    if (!room || !room.gameState || room.gameState.status !== 'ongoing') return;

    const player = room.gameState.players.find(p => p.userId === user.userId);
    if (!player) {
      socket.emit('game:error', { message: 'Bạn không phải người chơi.', code: 'NOT_A_PLAYER' });
      return;
    }

    if (!room._timeRequestPending) {
      socket.emit('game:error', { message: 'Không có yêu cầu xin thời gian.', code: 'NO_TIME_REQUEST' });
      return;
    }
    if (room._timeRequestPending.from === user.userId) {
      socket.emit('game:error', { message: 'Bạn không thể tự từ chối.', code: 'CANNOT_SELF_DECLINE' });
      return;
    }

    room._timeRequestPending = null;
    io.to(room.roomId).emit('game:time_declined', { by: user.userId });
    io.to(room.roomId).emit('chat:message', {
      from: null, fromId: null,
      text: `${user.displayName} từ chối yêu cầu xin thời gian.`,
      code: 'GAME_TIME_DECLINED', vars: { name: user.displayName },
      timestamp: Date.now(), isSystem: true,
    });
  });

}

// =============================================================================
// Game Lifecycle (exported for use by RoomHandler and DisconnectHandler)
// =============================================================================

/**
 * Build and start the per-room timer using the engine's resolved player colors.
 * Shared by normal game start and Swap2 opening.
 *
 * @param {{blackPlayerId: string, whitePlayerId: string}} [idOverride] — use
 *   these ids instead of looking players up by `color`. Needed for Swap2,
 *   where `startGame()` must start the clock before colors are assigned
 *   (`player.color` is still `null`); see instruction.md §B37.
 */
function startTimerForGame(io, room, engine, idOverride) {
  const roomId = room.roomId;
  const settings = room.settings;

  const blackPlayerId = idOverride
    ? idOverride.blackPlayerId
    : engine.players.find(p => p.color === 'BLACK').userId;
  const whitePlayerId = idOverride
    ? idOverride.whitePlayerId
    : engine.players.find(p => p.color === 'WHITE').userId;

  const timer = new TimerManager({
    roomId,
    mode: settings.timerMode,
    seconds: settings.timerSeconds,
    incrementSeconds: settings.timerIncrementSeconds || 0,
    blackPlayerId,
    whitePlayerId,
    // No per-tick broadcast. The tick keeps the server's authoritative
    // clock (and fires onTimeout); clients run their own countdown from the
    // deadline in timer:sync. See review 4.3.
    onTick: () => {},
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
        code: 'GAME_TIMED_OUT', vars: { name: timedOutUser ? timedOutUser.displayName : '—' },
        timestamp: Date.now(), isSystem: true,
      });
    },
  });

  timerMap.set(roomId, timer);
  timer.start();
  // First sync of the game — the client starts its own countdown from here.
  io.to(roomId).emit('timer:sync', timer.getSync());
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
    io.to(roomId).emit('game:error', { message: 'Thiếu người chơi.', code: 'MISSING_PLAYERS' });
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
      code: 'MAP_GEN_FAILED',
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
        { userId: blackPlayer.userId, displayName: blackPlayer.displayName, color: null, isGuest: blackPlayer.isGuest },
        { userId: whitePlayer.userId, displayName: whitePlayer.displayName, color: null, isGuest: whitePlayer.isGuest },
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

    // Timer runs from the very first opening stone — no exemption for the
    // Swap2 place3/p2choice/place2/p1choice phases (instruction.md §B37).
    // Colors aren't assigned yet, so black/white slots are placeholders for
    // firstPlayerId/secondPlayerId; the game:swap2_choice handler calls
    // timer.remapForSwap2() to fix the labels once colors resolve.
    const timer = startTimerForGame(io, room, engine, {
      blackPlayerId: engine.firstPlayerId,
      whitePlayerId: engine.secondPlayerId,
    });

    io.to(roomId).emit('game:init', {
      ...engine.serialize(),
      timer: timer.getTimers(),
      timerSync: timer.getSync(),
    });
    broadcastRoomUpdate(io, room);
    broadcastLobbyUpdate(io);
    io.to(roomId).emit('chat:message', {
      from: null, fromId: null,
      text: `Swap2: ${blackPlayer.displayName} đặt 3 quân mở màn.`,
      code: 'SWAP2_PLACED_OPENING', vars: { name: blackPlayer.displayName },
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
      { userId: blackPlayer.userId, displayName: blackPlayer.displayName, color: 'BLACK', isGuest: blackPlayer.isGuest },
      { userId: whitePlayer.userId, displayName: whitePlayer.displayName, color: 'WHITE', isGuest: whitePlayer.isGuest },
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
  io.to(roomId).emit('game:init', {
    ...engine.serialize(),
    timer: timer.getTimers(),
    timerSync: timer.getSync(),
  });
  broadcastRoomUpdate(io, room);
  broadcastLobbyUpdate(io);
  io.to(roomId).emit('chat:message', {
    from: null, fromId: null,
    text: 'Ván đấu bắt đầu! Đen đi trước.',
    code: 'GAME_STARTED',
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
  if (engine && engine.result && !noScore) {
    try {
      database.saveGame({
        gameId: engine.gameId,
        roomId: engine.roomId,
        players: engine.players.map(p => ({
          id: p.userId,
          name: p.displayName,
          color: p.color,
          isGuest: p.isGuest,
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
  // Idempotency keys are scoped to a single game (TODO.md #152) — a fresh
  // game must not resolve a moveId against the finished one's move payload.
  room._moveAcks = null;
  room.readyDeadline = null;
  room.readyMissCount = 0;
  for (const [, u] of room.users) u.ready = false;

  broadcastRoomUpdate(io, room);
  broadcastLobbyUpdate(io);
}

module.exports = { register, startGame, handleGameEnd };
