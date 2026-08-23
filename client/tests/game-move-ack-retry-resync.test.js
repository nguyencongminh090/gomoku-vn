/**
 * TODO.md #152 — client half of the ack/timeout/retry/resync path for moves.
 *
 * `game:move` was a bare emit and the stone was only ever drawn on the
 * server's `game:moved` broadcast. Lose either packet while the socket stays
 * up — the selective-loss pattern reported by players on lossy networks — and
 * the client waits forever for a broadcast that is not coming, with no error,
 * no spinner and no way out but a reload.
 *
 * The pieces guarded here are the ones whose failure is invisible to a
 * happy-path test:
 *   - the retry must reuse the *same* moveId (a fresh one silently defeats the
 *     server's whole dedupe mechanism while every green test stays green)
 *   - the retry must happen exactly once, then hand over to resync
 *   - an ack that carries an error must never be retried
 *   - the receive-side gap check must not resync itself in a loop
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const JS = (name) => fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
const GAME_UI_SOURCE     = JS('game-ui.js');
const ROOM_SOCKET_SOURCE = JS('room-socket.js');
const I18N_SOURCE        = JS('i18n.js');

/**
 * A RoomClient stub that parks every `emitAck` call instead of answering it,
 * so a test can decide per attempt whether the ack arrives, errors, or times
 * out — the three branches of the state machine.
 */
function makeClientStub() {
  return {
    // Left false on purpose: room-socket.js calls processRoomIntent() inline
    // when the socket is already connected at load, and sessionStorage room
    // intent is not what these tests are about.
    socket: { connected: false },
    listeners: {},
    ackCalls: [],
    plainEmits: [],
    on(event, cb) { this.listeners[event] = cb; return this; },
    emit(event, data) { this.plainEmits.push({ event, data }); },
    emitAck(event, data, timeoutMs, cb) {
      this.ackCalls.push({ event, data, timeoutMs, cb });
    },
    /** Fire the Nth outstanding attempt's callback as a timeout. */
    timeout(i) { this.ackCalls[i].cb(new Error('operation has timed out')); },
    /** Fire the Nth outstanding attempt's callback with a server response. */
    respond(i, res) { this.ackCalls[i].cb(null, res); },
  };
}

/** Load game-ui.js + room-socket.js into this jsdom with their globals stubbed. */
function loadRoomModules({ gameStatus = 'ongoing', moveCount = 5 } = {}) {
  document.body.innerHTML = '<div id="board-area"></div><div id="chat-messages"></div>';

  const client = makeClientStub();
  window.RoomClient = client;

  const systemMessages = [];
  window.ChatUI = {
    appendSystemMessage: (text) => systemMessages.push(text),
    appendChatMessage: jest.fn(),
    showFloatMessage: jest.fn(),
  };

  const rendered = { boardState: 0, ui: 0 };
  window.RoomUI = { updateUI: () => { rendered.ui++; } };

  window.RoomState = {
    myUser: { userId: 'me' },
    roomData: { roomId: 'r1' },
    gameState: {
      status: gameStatus,
      moveCount,
      currentTurn: 'me',
      board: Array.from({ length: 15 }, () => new Array(15).fill(0)),
      moveHistory: [],
      players: [
        { userId: 'me', color: 'BLACK' },
        { userId: 'them', color: 'WHITE' },
      ],
    },
  };

  // i18n.js provides `t()` as a global, which both modules call directly.
  window.eval(I18N_SOURCE);
  window.eval(GAME_UI_SOURCE);
  // GameUI's board renderer is never constructed here (no canvas), so the
  // handlers room-socket.js calls after applying a move are stubbed out.
  window.GameUI.updateBoardState = () => { rendered.boardState++; };
  window.GameUI.renderDrawPrompt = jest.fn();
  window.GameUI.renderUndoPrompt = jest.fn();
  window.GameUI.initBoard = jest.fn();
  window.GameUI.renderSwap2 = jest.fn();
  window.eval(ROOM_SOCKET_SOURCE);

  return { client, systemMessages, rendered, st: window.RoomState };
}

describe('GameUI.sendMove — ack, timeout, one retry, then resync', () => {
  test('first attempt carries a moveId and a 5 s deadline', () => {
    const { client } = loadRoomModules();
    window.GameUI.sendMove(3, 4);

    expect(client.ackCalls).toHaveLength(1);
    const { event, data, timeoutMs } = client.ackCalls[0];
    expect(event).toBe('game:move');
    expect(data).toMatchObject({ x: 3, y: 4 });
    expect(typeof data.moveId).toBe('string');
    expect(data.moveId.length).toBeGreaterThan(0);
    expect(timeoutMs).toBe(5000);
  });

  test('the retry reuses the SAME moveId — a fresh one would defeat server dedupe', () => {
    const { client } = loadRoomModules();
    window.GameUI.sendMove(3, 4);
    const firstId = client.ackCalls[0].data.moveId;

    client.timeout(0);

    expect(client.ackCalls).toHaveLength(2);
    expect(client.ackCalls[1].data.moveId).toBe(firstId);
    expect(client.ackCalls[1].data).toMatchObject({ x: 3, y: 4 });
  });

  test('two separate moves get distinct moveIds', () => {
    const { client } = loadRoomModules();
    window.GameUI.sendMove(1, 1);
    window.GameUI.sendMove(2, 2);

    expect(client.ackCalls[0].data.moveId).not.toBe(client.ackCalls[1].data.moveId);
  });

  test('a second timeout stops retrying and asks for a resync', () => {
    const { client, systemMessages } = loadRoomModules();
    window.GameUI.sendMove(3, 4);

    client.timeout(0);
    client.timeout(1);

    expect(client.ackCalls).toHaveLength(2);          // no third attempt
    expect(client.plainEmits).toEqual([{ event: 'game:resync', data: undefined }]);
    expect(systemMessages).toHaveLength(2);           // retrying, then failed
  });

  test('a successful ack ends the exchange silently', () => {
    const { client, systemMessages } = loadRoomModules();
    window.GameUI.sendMove(3, 4);

    client.respond(0, { ok: true, moveCount: 6 });

    expect(client.ackCalls).toHaveLength(1);
    expect(client.plainEmits).toHaveLength(0);
    expect(systemMessages).toHaveLength(0);
  });

  test('an ack carrying an error is shown and never retried', () => {
    const { client, systemMessages } = loadRoomModules();
    window.GameUI.sendMove(3, 4);

    client.respond(0, { error: 'Ô đã có quân.', code: 'CELL_OCCUPIED' });

    expect(client.ackCalls).toHaveLength(1);
    expect(client.plainEmits).toHaveLength(0);
    expect(systemMessages).toHaveLength(1);
  });

  test('a timeout after the game has ended is dropped instead of retried', () => {
    // The move itself may have been the winning one with only its ack lost;
    // retrying then earns a NO_ACTIVE_GAME error for a move that in fact won.
    const { client, systemMessages, st } = loadRoomModules();
    window.GameUI.sendMove(3, 4);

    st.gameState.status = 'finished';
    client.timeout(0);

    expect(client.ackCalls).toHaveLength(1);
    expect(client.plainEmits).toHaveLength(0);
    expect(systemMessages).toHaveLength(0);
  });
});

describe('game:moved — receive-side gap detection', () => {
  const moved = (extra) => ({
    x: 1, y: 2, color: 'WHITE', nextTurn: 'me', ...extra,
  });

  test('the next sequential moveCount is applied normally, with no resync', () => {
    const { client, st, rendered } = loadRoomModules({ moveCount: 5 });

    client.listeners['game:moved'](moved({ moveCount: 6 }));

    expect(st.gameState.moveCount).toBe(6);
    expect(st.gameState.board[2][1]).toBe(2);
    expect(st.gameState.moveHistory).toHaveLength(1);
    expect(client.plainEmits).toHaveLength(0);
    expect(rendered.boardState).toBe(1);
  });

  test('a skipped moveCount means a dropped broadcast — resync, do not apply the delta', () => {
    const { client, st } = loadRoomModules({ moveCount: 5 });

    client.listeners['game:moved'](moved({ moveCount: 7 }));

    expect(client.plainEmits).toEqual([{ event: 'game:resync', data: undefined }]);
    // Applying a delta onto the wrong base is what makes the boards diverge.
    expect(st.gameState.moveCount).toBe(5);
    expect(st.gameState.board[2][1]).toBe(0);
    expect(st.gameState.moveHistory).toHaveLength(0);
  });

  test('a replayed move (moveCount already reached) is ignored, not double-applied', () => {
    const { client, st } = loadRoomModules({ moveCount: 5 });

    client.listeners['game:moved'](moved({ moveCount: 5 }));
    client.listeners['game:moved'](moved({ moveCount: 3 }));

    expect(st.gameState.moveHistory).toHaveLength(0);
    expect(client.plainEmits).toHaveLength(0);
  });

  test('the resync answer resets the baseline instead of reading as another gap', () => {
    // The trap this guards: game:resync answers with full state whose
    // moveCount has jumped, so a gap check that fired on every path would
    // read its own answer as a gap and resync forever.
    const { client, st } = loadRoomModules({ moveCount: 5 });

    client.listeners['game:moved'](moved({ moveCount: 12 }));
    expect(client.plainEmits).toHaveLength(1);

    // …server answers the resync as a room:joined carrying full state.
    client.listeners['room:joined']({
      roomId: 'r1',
      users: [],
      gameState: {
        status: 'ongoing', moveCount: 11, currentTurn: 'me',
        board: Array.from({ length: 15 }, () => new Array(15).fill(0)),
        moveHistory: [], players: st.gameState.players,
      },
    });

    expect(st.gameState.moveCount).toBe(11);
    expect(client.plainEmits).toHaveLength(1);   // still just the one resync

    // The next broadcast now lines up with the new baseline.
    client.listeners['game:moved'](moved({ moveCount: 12 }));
    expect(st.gameState.moveCount).toBe(12);
    expect(client.plainEmits).toHaveLength(1);   // and no further resync
  });

  test.each(['game:init', 'game:swap2_state', 'game:undo_applied'])(
    '%s sets the baseline wholesale and never gap-checks',
    (event) => {
      const { client, st } = loadRoomModules({ moveCount: 5 });
      const payloads = {
        'game:init': {
          status: 'ongoing', moveCount: 40, currentTurn: 'me',
          board: Array.from({ length: 15 }, () => new Array(15).fill(0)),
          moveHistory: [], players: st.gameState.players,
        },
        'game:swap2_state': {
          board: st.gameState.board, currentTurn: 'me', moveCount: 40,
          swap2: { enabled: true, openingPhase: 'place3' },
          players: st.gameState.players, nextColor: 'BLACK',
        },
        'game:undo_applied': { cleared: [], currentTurn: 'me', moveCount: 40 },
      };

      client.listeners[event](payloads[event]);

      expect(st.gameState.moveCount).toBe(40);
      expect(client.plainEmits).toHaveLength(0);
    },
  );
});

describe('i18n coverage for the new notices', () => {
  const KEYS = ['room.move_retrying', 'room.move_failed'];

  test.each(KEYS)('%s resolves in both vi and en', (key) => {
    loadRoomModules();
    const seen = new Set();
    for (const lang of ['vi', 'en']) {
      window.setLanguage(lang);
      const text = window.t(key);
      expect(text).toBeTruthy();
      // An unknown key falls through and `t()` returns the key itself —
      // exactly the shape a half-translated ship takes, so rule it out rather
      // than just checking for a non-empty string.
      expect(text).not.toBe(key);
      seen.add(text);
    }
    // Both locales present but identical usually means one was copy-pasted.
    expect(seen.size).toBe(2);
    window.setLanguage('vi');
  });

  test('the notices shown on retry and on give-up are translated, not raw keys', () => {
    const { client, systemMessages } = loadRoomModules();
    window.GameUI.sendMove(3, 4);
    client.timeout(0);
    client.timeout(1);

    for (const msg of systemMessages) {
      expect(msg).not.toMatch(/^room\./);
      expect(msg.length).toBeGreaterThan(0);
    }
  });
});
