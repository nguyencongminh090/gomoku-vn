/**
 * TODO.md #154 — the half of the dropped-broadcast problem #152 could not reach.
 *
 * #152's gap check compares `moveCount` on an incoming `game:moved`, so it can
 * only notice a loss when a *later* broadcast arrives. With two players
 * alternating strictly, that later broadcast IS the move the stuck side is
 * waiting for: it never comes, the gap check never runs, and both players sit
 * there until one loses on time. There is no periodic server broadcast to act
 * as a wake-up either — the clock rides on the very packet that was dropped.
 *
 * The watchdog added here uses `timerSync.deadline` as that wake-up. The server
 * is the only timeout authority and always ends a game when a clock hits zero,
 * so a deadline sailing past in silence is proof — not a guess — that this
 * client's idea of the game is stale.
 *
 * What these tests are really guarding, i.e. what breaks silently:
 *   - the threshold, from BOTH sides. Too eager and every long think resyncs
 *     (the measured distribution in room-socket.js says a flat 15 s would have
 *     fired in 75% of real games); too patient and it loses a race it must win.
 *     The stuck player's own clock is already running server-side and flags at
 *     `opponent's move + T`, only a think-time after the deadline being
 *     watched — so a watchdog that waits for that deadline gets there after
 *     the player has already lost on time, which is the exact outcome this
 *     item exists to prevent. An earlier draft did precisely that and an e2e
 *     run caught it: timed out and lost at 14.8 s, watchdog due at 21 s. Hence
 *     firing at a *fraction* of the watched clock, which is provably always
 *     ahead of the stuck player's own flag-fall.
 *   - self-cancellation. A watchdog surviving a game end / undo / Swap2 /
 *     interruption fires a resync into a game that is over — the orphan-resync
 *     failure mode called out in docs/instruction/B154-*.md.
 *   - termination. A watchdog that re-arms on a state that never changes is a
 *     resync loop, the same trap as #152's bug 7.
 *   - the second variant: ack OK but our own broadcast dropped. Nothing else
 *     in the system notices that one at all — the #152 retry path only runs on
 *     a *missing* ack.
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
// Shared clock maths both room modules call into (TODO.md #168). room.html
// loads it as a classic script before the module entry; evaluating it first
// here reproduces that order.
const TIMER_SYNC_CORE_SOURCE = JS('timer-sync-core.js');

// Mirrors of the constants in room-socket.js. Deliberately re-stated rather
// than imported: if someone edits the threshold, these tests should fail and
// make them re-justify it against the measured distribution, not silently
// follow along.
const WAIT_FRACTION           = 0.75;
const WAIT_CEILING_MS         = 83500;
const MOVE_CONFIRM_TIMEOUT_MS = 2500;
const WATCHDOG_FLOOR_MS       = 15000;

const CLOCK_MS = 60000;   // default per_move allowance (server/config.js)
/** When the watchdog is due on a full default clock: 45 s. */
const FIRE_AT  = CLOCK_MS * WAIT_FRACTION;

function makeClientStub() {
  return {
    socket: { connected: false },
    listeners: {},
    ackCalls: [],
    plainEmits: [],
    on(event, cb) { this.listeners[event] = cb; return this; },
    emit(event, data) { this.plainEmits.push({ event, data }); },
    emitAck(event, data, timeoutMs, cb) { this.ackCalls.push({ event, data, timeoutMs, cb }); },
    timeout(i) { this.ackCalls[i].cb(new Error('operation has timed out')); },
    respond(i, res) { this.ackCalls[i].cb(null, res); },
    /** Every game:resync this client has asked for. */
    resyncs() { return this.plainEmits.filter(e => e.event === 'game:resync'); },
  };
}

/** A timerSync as TimerManager.getSync() builds it, `ms` from now. */
function sync({ activeColor = 'white', ms = CLOCK_MS, running = true } = {}) {
  const now = Date.now();
  return {
    black: Math.round(ms / 1000),
    white: Math.round(ms / 1000),
    activeColor,
    deadline: running ? now + ms : null,
    serverTime: now,
    running,
  };
}

function loadRoomModules({ gameStatus = 'ongoing', moveCount = 5 } = {}) {
  document.body.innerHTML = '<div id="board-area"></div><div id="chat-messages"></div>';

  const client = makeClientStub();
  window.RoomClient = client;

  window.ChatUI = {
    appendSystemMessage: jest.fn(),
    appendChatMessage: jest.fn(),
    showFloatMessage: jest.fn(),
  };
  window.RoomUI = { updateUI: jest.fn() };

  // Stands in for BoardRenderer's optimistic-stone overlay (TODO.md #153) —
  // the move-confirm watchdog reads it to tell "confirmed" from "still
  // pending", so it has to behave like the real one, not be a bare mock.
  const boardRenderer = {
    optimisticStone: null,
    setOptimisticStone(s) { this.optimisticStone = s; },
    markOptimisticWarning() {
      if (this.optimisticStone) this.optimisticStone.warning = true;
    },
    resize: jest.fn(),
  };

  window.RoomState = {
    myUser: { userId: 'me' },
    roomData: { roomId: 'r1' },
    boardRenderer,
    timerValues: { black: 60, white: 60 },
    predictedTurn: { active: false, forColor: null, snapshotTimerValues: null, switchedAtLocalTs: null },
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

  window.eval(TIMER_SYNC_CORE_SOURCE);
  window.eval(I18N_SOURCE);
  window.eval(GAME_UI_SOURCE);
  window.GameUI.updateBoardState = jest.fn();
  window.GameUI.renderDrawPrompt = jest.fn();
  window.GameUI.renderUndoPrompt = jest.fn();
  window.GameUI.renderTimePrompt = jest.fn();
  window.GameUI.initBoard = jest.fn();
  window.GameUI.renderSwap2 = jest.fn();
  window.GameUI.renderTimers = jest.fn();
  window.GameUI.renderGameControls = jest.fn();
  window.GameUI.setTurnBarVisible = jest.fn();
  window.eval(ROOM_SOCKET_SOURCE);

  return { client, boardRenderer, st: window.RoomState };
}

/**
 * Put the client in the guarded state: a clock running, and us waiting on the
 * opponent. The turn matters — the watchdog deliberately stands down on our own
 * turn, where a long think is a player thinking, not a player stuck.
 */
function startClock(client, opts = {}) {
  const { turn = 'them', ...syncOpts } = opts;
  window.RoomState.gameState.currentTurn = turn;
  client.listeners['timer:sync'](sync(syncOpts));
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

describe('turn watchdog — when it fires', () => {
  test('stays silent while the opponent still has a quarter of their clock', () => {
    const { client } = loadRoomModules();
    startClock(client);

    jest.advanceTimersByTime(FIRE_AT - 1);

    expect(client.resyncs()).toHaveLength(0);
  });

  test('fires once three quarters of the watched clock has gone in silence', () => {
    const { client } = loadRoomModules();
    startClock(client);

    jest.advanceTimersByTime(FIRE_AT + 1);

    expect(client.resyncs()).toHaveLength(1);
  });

  test('fires before the stuck player would lose on time — the whole point', () => {
    // The regression for the bug an e2e run caught in the first draft of this
    // watchdog. If we are stuck, the server has us on move and our clock flags
    // at (opponent's move + T), which is *after* the deadline we are watching
    // by however long they thought. Firing at or after that deadline therefore
    // races our own flag-fall and loses it whenever they moved quickly — the
    // measured case was a loss on time at 14.8 s with the watchdog due at 21 s.
    // Firing strictly before the watched deadline is what makes that
    // impossible, whatever the opponent did.
    const { client } = loadRoomModules();
    startClock(client);

    jest.advanceTimersByTime(CLOCK_MS - 1);

    expect(client.resyncs().length).toBeGreaterThan(0);
  });

  test('stands down on our own turn — a long think is not a stuck player', () => {
    // Believing it is our turn and being wrong is the other variant, and it has
    // two faster answers already (the move-confirm watchdog, and #152's gap
    // check on the opponent's reply). Guarding here instead would resync every
    // deep think.
    const { client } = loadRoomModules();
    startClock(client, { turn: 'me' });

    jest.advanceTimersByTime(WAIT_CEILING_MS * 2);

    expect(client.resyncs()).toHaveLength(0);
  });

  test('a long clock is capped by the measured ceiling instead of waiting it out', () => {
    // per_game / blitz with minutes left: three quarters of that is a valid
    // bound but a uselessly slow one, so the p99.9-of-real-play ceiling wins.
    const { client } = loadRoomModules();
    startClock(client, { ms: 10 * 60 * 1000 });

    jest.advanceTimersByTime(WAIT_CEILING_MS - 1);
    expect(client.resyncs()).toHaveLength(0);

    jest.advanceTimersByTime(2);
    expect(client.resyncs()).toHaveLength(1);
  });

  test('an ordinary long think on the default clock is left alone', () => {
    // p90 of real inter-move gaps is 24.8 s and p95 is 33.4 s, all legitimate.
    // A flat 15 s threshold would have fired in 75% of real games.
    const { client } = loadRoomModules();
    startClock(client);

    jest.advanceTimersByTime(40000);

    expect(client.resyncs()).toHaveLength(0);
  });

  test('a paused clock (disconnect grace) arms nothing', () => {
    const { client } = loadRoomModules();
    startClock(client, { running: false });

    jest.advanceTimersByTime(WAIT_CEILING_MS * 2);

    expect(client.resyncs()).toHaveLength(0);
  });

  test('an opponent move re-points the watchdog at the new clock', () => {
    const { client, st } = loadRoomModules({ moveCount: 5 });
    startClock(client);

    jest.advanceTimersByTime(FIRE_AT - 5000);
    client.listeners['game:moved']({
      x: 1, y: 2, color: 'WHITE', nextTurn: 'them', moveCount: 6,
      timerSync: sync(),
    });
    st.gameState.currentTurn = 'them';

    // The old fire time comes and goes — the move reset the clock being
    // measured, so the countdown starts over.
    jest.advanceTimersByTime(5001);
    expect(client.resyncs()).toHaveLength(0);

    jest.advanceTimersByTime(FIRE_AT);
    expect(client.resyncs()).toHaveLength(1);
  });
});

describe('turn watchdog — the deadlock it exists for', () => {
  test('a player who misses the opponent\'s move recovers without touching anything', () => {
    // The mandatory case from docs/instruction/B154-*.md: two players
    // alternating, one `game:moved` dropped, nobody clicks anything again.
    // Before this fix nothing on this client would ever fire — the gap check
    // needs a *later* broadcast, and the only later broadcast is the move that
    // is not coming.
    const { client } = loadRoomModules({ moveCount: 5 });

    // Our last confirmed view: the opponent is on move with a full clock.
    startClock(client, { activeColor: 'white' });

    // …the opponent moves, the server switches the turn to us, and that
    // broadcast is dropped on the wire. Nothing arrives here at all.
    jest.advanceTimersByTime(FIRE_AT + 1);

    expect(client.resyncs()).toHaveLength(1);
  });

  test('the resync answer settles it instead of starting another round', () => {
    const { client, st } = loadRoomModules({ moveCount: 5 });
    startClock(client);

    jest.advanceTimersByTime(FIRE_AT + 1);
    expect(client.resyncs()).toHaveLength(1);

    // The answer says it was our turn all along — which is also a state the
    // watchdog stands down on, so nothing further should fire.
    client.listeners['room:joined']({
      roomId: 'r1',
      users: [],
      gameState: {
        status: 'ongoing', moveCount: 6, currentTurn: 'me',
        board: st.gameState.board, moveHistory: [], players: st.gameState.players,
      },
      timerSync: sync({ activeColor: 'black' }),
    });

    jest.advanceTimersByTime(WAIT_CEILING_MS * 2);
    expect(client.resyncs()).toHaveLength(1);
  });

  test('an unanswered resync retries, backing off instead of looping', () => {
    // If the resync answer is lost too, something still has to try again — but
    // re-arming at the same interval on state that never changes is a resync
    // storm. Each repeat on unchanged state must wait longer than the last.
    const { client } = loadRoomModules();
    startClock(client);

    jest.advanceTimersByTime(FIRE_AT + 1);
    expect(client.resyncs()).toHaveLength(1);

    // Repeats are rate-limited rather than fraction-based — the fraction of a
    // clock already nearly gone would only shrink toward zero and spin.
    jest.advanceTimersByTime(WATCHDOG_FLOOR_MS + 1);
    expect(client.resyncs()).toHaveLength(2);

    // The next one is twice as far off, so the same span buys nothing.
    jest.advanceTimersByTime(WATCHDOG_FLOOR_MS);
    expect(client.resyncs()).toHaveLength(2);
  });

  test('ten minutes of silence produces a handful of resyncs, not hundreds', () => {
    const { client } = loadRoomModules();
    startClock(client);

    jest.advanceTimersByTime(10 * 60 * 1000);

    expect(client.resyncs().length).toBeGreaterThan(0);
    expect(client.resyncs().length).toBeLessThan(15);
  });
});

describe('turn watchdog — self-cancellation (no orphaned resyncs)', () => {
  const cancelPaths = [
    ['game:ended', (client) => client.listeners['game:ended']({ result: { winner: 'me' } })],
    ['room:left', (client) => client.listeners['room:left']()],
    ['game:interrupted', (client) => client.listeners['game:interrupted']({ playerName: 'x', secondsLeft: 30 })],
  ];

  test.each(cancelPaths)('%s stops the pending watchdog', (_name, trigger) => {
    const { client } = loadRoomModules();
    startClock(client);

    jest.advanceTimersByTime(1000);
    trigger(client);
    jest.advanceTimersByTime(WAIT_CEILING_MS * 3);

    expect(client.resyncs()).toHaveLength(0);
  });

  test('a game that ends while the watchdog is pending never resyncs', () => {
    // Belt and braces for the same trap from the other side: even if some
    // future path forgets to cancel, the fire itself re-checks the game.
    const { client, st } = loadRoomModules();
    startClock(client);

    st.gameState.status = 'finished';
    jest.advanceTimersByTime(WAIT_CEILING_MS * 2);

    expect(client.resyncs()).toHaveLength(0);
  });

  test('undo re-points the watchdog rather than leaving it on the old turn', () => {
    const { client } = loadRoomModules({ moveCount: 5 });
    startClock(client);

    jest.advanceTimersByTime(FIRE_AT - 1000);
    // Still the opponent's turn afterwards, so the watchdog stays relevant —
    // this has to prove a re-arm, not a stand-down.
    client.listeners['game:undo_applied']({ cleared: [{ x: 1, y: 2 }], currentTurn: 'them', moveCount: 4 });

    // The moment the old timer was due passes without a fire.
    jest.advanceTimersByTime(1001);
    expect(client.resyncs()).toHaveLength(0);
  });

  test('a Swap2 state load re-points the watchdog too', () => {
    const { client, st } = loadRoomModules({ moveCount: 2 });
    startClock(client);

    jest.advanceTimersByTime(FIRE_AT - 1000);
    client.listeners['game:swap2_state']({
      board: st.gameState.board,
      currentTurn: 'them',
      moveCount: 3,
      swap2: { enabled: true, openingPhase: 'place3' },
      players: st.gameState.players,
      nextColor: 'BLACK',
    });

    jest.advanceTimersByTime(1001);
    expect(client.resyncs()).toHaveLength(0);
  });
});

describe('move-confirm watchdog — ack OK but our own broadcast dropped', () => {
  test('an accepted move whose broadcast never arrives resyncs', () => {
    // The variant nothing else catches: the #152 retry path only runs when the
    // *ack* is missing, and here the ack came back fine.
    const { client, boardRenderer } = loadRoomModules();
    startClock(client);
    window.GameUI.sendMove(3, 4);
    expect(boardRenderer.optimisticStone).toMatchObject({ x: 3, y: 4 });

    client.respond(0, { ok: true, moveCount: 6 });
    jest.advanceTimersByTime(MOVE_CONFIRM_TIMEOUT_MS + 1);

    expect(client.resyncs()).toHaveLength(1);
  });

  test('the broadcast arriving cancels it', () => {
    const { client, boardRenderer } = loadRoomModules({ moveCount: 5 });
    startClock(client);
    window.GameUI.sendMove(3, 4);
    client.respond(0, { ok: true, moveCount: 6 });

    client.listeners['game:moved']({
      x: 3, y: 4, color: 'BLACK', nextTurn: 'them', moveCount: 6, timerSync: sync(),
    });
    expect(boardRenderer.optimisticStone).toBeNull();

    jest.advanceTimersByTime(MOVE_CONFIRM_TIMEOUT_MS * 4);
    expect(client.resyncs()).toHaveLength(0);
  });

  test('a rejected move does not arm it — the server already answered', () => {
    const { client } = loadRoomModules();
    startClock(client);
    window.GameUI.sendMove(3, 4);

    client.respond(0, { error: 'Ô đã có quân.', code: 'CELL_OCCUPIED' });
    jest.advanceTimersByTime(MOVE_CONFIRM_TIMEOUT_MS * 4);

    expect(client.resyncs()).toHaveLength(0);
  });

  test('a game that ends inside the window does not resync', () => {
    // The move may well have been the winning one, acked with only its
    // broadcast lost; game:ended rebuilds nothing worth resyncing for.
    const { client } = loadRoomModules();
    startClock(client);
    window.GameUI.sendMove(3, 4);
    client.respond(0, { ok: true, moveCount: 6 });

    client.listeners['game:ended']({ result: { winner: 'me' } });
    jest.advanceTimersByTime(MOVE_CONFIRM_TIMEOUT_MS * 4);

    expect(client.resyncs()).toHaveLength(0);
  });

  test('it waits for the ack rather than racing the round trip', () => {
    // Armed at send time instead of on the ack, every ordinary move slower
    // than the window would resync.
    const { client } = loadRoomModules();
    startClock(client);
    window.GameUI.sendMove(3, 4);

    jest.advanceTimersByTime(MOVE_CONFIRM_TIMEOUT_MS * 1.5);
    expect(client.resyncs()).toHaveLength(0);

    client.respond(0, { ok: true, moveCount: 6 });
    jest.advanceTimersByTime(MOVE_CONFIRM_TIMEOUT_MS + 1);
    expect(client.resyncs()).toHaveLength(1);
  });

  test('#152\'s two-timeouts-then-resync path still stands on its own', () => {
    const { client } = loadRoomModules();
    startClock(client);
    window.GameUI.sendMove(3, 4);

    client.timeout(0);
    client.timeout(1);

    expect(client.ackCalls).toHaveLength(2);
    expect(client.resyncs()).toHaveLength(1);
  });
});
