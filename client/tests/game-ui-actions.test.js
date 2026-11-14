/**
 * TODO.md #216 — room action tiles, two-tap confirm, request toasts, moves tab.
 *
 *   - Lùi / Xin time exist only in a friendly game (gameState.rated !== true);
 *     the server refuses them otherwise (FRIENDLY_ONLY, server test).
 *   - Resign and draw take two taps inside 3 s (no blocking confirm() dialog);
 *     the countdown shows as a toast, never over the board.
 *   - Opponent requests render as toasts with ✓ / ✕; your own as one line.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const JS = (name) => fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');
const I18N_SOURCE = JS('i18n.js');
const GAME_UI_SOURCE = JS('game-ui.js');

function setup({ rated = false, me = true, status = 'ongoing', moveHistory = [] } = {}) {
  document.body.innerHTML = `
    <div id="board-area"></div>
    <div id="game-toasts">
      <div id="draw-prompt-area"></div><div id="time-prompt-area"></div>
      <div id="undo-prompt-area"></div><div id="confirm-prompt-area"></div>
    </div>
    <div id="tab-moves"><ol id="moves-list"></ol><ol id="moves-grid"></ol></div>
    <div id="game-controls"></div>
  `;
  window.requestAnimationFrame = (cb) => cb();
  window.confirm = jest.fn(() => true);
  const emits = [];
  window.RoomClient = { emit: (e, d) => emits.push(e), emitAck() {}, on() { return this; } };
  window.RoomState = {
    myUser: { userId: 'me' },
    boardRenderer: null,
    timerValues: { black: 60, white: 60 },
    predictedTurn: { active: false },
    gameState: {
      status, rated, boardSize: 15, currentTurn: 'me', moveHistory,
      players: [{ userId: me ? 'me' : 'x', color: 'BLACK', displayName: 'Me' }, { userId: 'them', color: 'WHITE', displayName: 'Foe' }],
    },
  };
  window.eval(I18N_SOURCE);
  window.eval(GAME_UI_SOURCE);
  return { emits };
}

const tiles = () => [...document.querySelectorAll('#game-controls .act')].map(b => b.dataset.action);
const tile = (a) => document.querySelector(`#game-controls [data-action="${a}"]`);

afterEach(() => jest.useRealTimers());

describe('action tiles', () => {
  test('friendly game: Lùi · Xin time · Cầu hoà · Đầu hàng', () => {
    setup({ rated: false });
    window.GameUI.renderGameControls();
    expect(tiles()).toEqual(['doUndoRequest', 'doRequestTime', 'doDrawOffer', 'doResign']);
  });

  test('rated game: only Cầu hoà · Đầu hàng', () => {
    setup({ rated: true });
    window.GameUI.renderGameControls();
    expect(tiles()).toEqual(['doDrawOffer', 'doResign']);
  });

  test.each([
    ['spectator', { me: false }],
    ['finished game', { status: 'finished' }],
  ])('%s: no tiles at all', (_n, opts) => {
    setup(opts);
    window.GameUI.renderGameControls();
    expect(document.getElementById('game-controls').innerHTML).toBe('');
  });

  test('a pending undo / time request disables its own tile', () => {
    setup();
    window.RoomState.undoOfferPending = { from: 'me' };
    window.RoomState.timeRequestPending = { from: 'me' };
    window.GameUI.renderGameControls();
    expect(tile('doUndoRequest').disabled).toBe(true);
    expect(tile('doRequestTime').disabled).toBe(true);
    expect(tile('doDrawOffer').disabled).toBe(false);
  });
});

describe('two-tap confirm (resign, draw)', () => {
  test.each([
    ['doResign', 'game:resign', 'room.confirm_resign'],
    ['doDrawOffer', 'game:draw_offer', 'room.confirm_draw'],
  ])('%s: first tap arms + toast, second tap sends', (action, event, toastKey) => {
    jest.useFakeTimers();
    const { emits } = setup();
    window.GameUI.renderGameControls();
    window[action]();
    expect(emits).toEqual([]);
    expect(window.confirm).not.toHaveBeenCalled();
    expect(tile(action).classList.contains('act--confirm')).toBe(true);
    const toast = document.querySelector('#confirm-prompt-area .gtoast');
    expect(toast.textContent).toContain(window.t(toastKey));
    expect(toast.textContent).toContain('3s');
    expect(toast.closest('#board-area')).toBeNull();

    window[action]();
    expect(emits).toEqual([event]);
    expect(document.querySelector('#confirm-prompt-area').innerHTML).toBe('');
    expect(tile(action).classList.contains('act--confirm')).toBe(false);
  });

  test('the arm expires after 3 s; a late tap only re-arms', () => {
    jest.useFakeTimers();
    const { emits } = setup();
    window.GameUI.renderGameControls();
    window.doResign();
    jest.advanceTimersByTime(3100);
    expect(document.querySelector('#confirm-prompt-area').innerHTML).toBe('');
    expect(tile('doResign').classList.contains('act--confirm')).toBe(false);
    window.doResign();
    expect(emits).toEqual([]);
  });

  test('arming resign then tapping draw does not resign', () => {
    jest.useFakeTimers();
    const { emits } = setup();
    window.GameUI.renderGameControls();
    window.doResign();
    window.doDrawOffer();
    expect(emits).toEqual([]);
    expect(tile('doDrawOffer').classList.contains('act--confirm')).toBe(true);
    expect(tile('doResign').classList.contains('act--confirm')).toBe(false);
  });
});

describe('request toasts', () => {
  test('an opponent\'s draw offer: one line + ✓ / ✕ wired to accept / decline', () => {
    setup();
    window.RoomState.drawOfferPending = { from: 'them', fromName: '<b>Foe</b>' };
    window.GameUI.renderDrawPrompt();
    const t = document.querySelector('#draw-prompt-area .gtoast');
    expect(t.querySelector('[data-action="doDrawAccept"]')).not.toBeNull();
    expect(t.querySelector('[data-action="doDrawDecline"]')).not.toBeNull();
    expect(t.querySelector('b b')).toBeNull(); // the name is escaped, not markup
    expect(t.textContent).toContain('<b>Foe</b>');
  });

  test('my own pending undo: a quiet line without buttons', () => {
    setup();
    window.RoomState.undoOfferPending = { from: 'me' };
    window.GameUI.renderUndoPrompt();
    const t = document.querySelector('#undo-prompt-area .gtoast');
    expect(t.textContent).toContain(window.t('game.undo_waiting'));
    expect(t.querySelector('button')).toBeNull();
  });

  test('no pending request → nothing rendered', () => {
    setup();
    window.GameUI.renderTimePrompt();
    expect(document.getElementById('time-prompt-area').innerHTML).toBe('');
  });
});

describe('moves tab', () => {
  test('pairs per line in edge coordinates, newest highlighted', () => {
    setup({ moveHistory: [{ x: 7, y: 7 }, { x: 8, y: 6 }, { x: 0, y: 14 }] });
    window.GameUI.renderMoves();
    const rows = [...document.querySelectorAll('#moves-list li')].map(li => [...li.children].map(c => c.textContent).filter(Boolean).join(' '));
    expect(rows).toEqual(['1 H8 I9', '2 A1']);
    expect(document.querySelector('#moves-list .moves__cur').textContent).toBe('A1');
  });

  test('no moves yet → a placeholder line', () => {
    setup();
    window.GameUI.renderMoves();
    expect(document.querySelector('#moves-list .moves__empty')).not.toBeNull();
  });
});

// perf/play-lag (2026-11-14): one move appends one row instead of rebuilding both lists (the full
// rebuild, one inline SVG per move, reached ~50 ms/move late in a game on a 4×-throttled phone).
// Whatever is not "exactly one more move" must still rebuild, so the lists never drift.
describe('moves tab — incremental render', () => {
  const C = ['BLACK', 'WHITE'];
  const mv = (i) => ({ x: i % 15, y: Math.floor(i / 15), color: C[i % 2] });
  const hist = (k) => Array.from({ length: k }, (_, i) => mv(i));
  const pairs = () => [...document.querySelectorAll('#moves-list li')].map(li => [...li.children].map(c => c.textContent).filter(Boolean).join(' '));
  const grid = () => [...document.querySelectorAll('#moves-grid li')].map(li => li.textContent);
  const cur = () => [document.querySelectorAll('#moves-list .moves__cur').length, document.querySelectorAll('#moves-grid .moves-grid__cur').length,
    (document.querySelector('#moves-list .moves__cur') || {}).textContent, (document.querySelector('#moves-grid .moves-grid__cur b') || {}).textContent];
  // Reference: what a from-scratch render of the same history shows.
  function fresh(k) {
    const keep = window.RoomState.gameState.moveHistory;
    document.getElementById('moves-list').innerHTML = '';
    window.RoomState.gameState.moveHistory = [];
    window.GameUI.renderMoves(); // resets the drawn-state cache
    window.RoomState.gameState.moveHistory = hist(k);
    window.GameUI.renderMoves();
    const out = { pairs: pairs(), grid: grid(), cur: cur() };
    window.RoomState.gameState.moveHistory = keep;
    window.GameUI.renderMoves();
    return out;
  }
  const play = (to) => { const gs = window.RoomState.gameState; while (gs.moveHistory.length < to) { gs.moveHistory.push(mv(gs.moveHistory.length)); window.GameUI.renderMoves(); } };

  test('move by move equals a full render, and keeps the existing rows (no rebuild)', () => {
    setup({ moveHistory: [] });
    window.GameUI.renderMoves();
    play(1);
    const firstPair = document.querySelector('#moves-list li');
    const firstCell = document.querySelector('#moves-grid li');
    play(7);
    expect(document.querySelector('#moves-list li')).toBe(firstPair); // same node: appended, not rebuilt
    expect(document.querySelector('#moves-grid li')).toBe(firstCell);
    const got = { pairs: pairs(), grid: grid(), cur: cur() };
    expect(got).toEqual(fresh(7));
    expect(got.cur).toEqual([1, 1, mv(6) && 'G15', 'G15']);
    play(8); // white fills the open pair
    expect({ pairs: pairs(), grid: grid(), cur: cur() }).toEqual(fresh(8));
  });

  test('a repeat render with no new move changes nothing', () => {
    setup({ moveHistory: hist(5) });
    window.GameUI.renderMoves();
    const node = document.querySelector('#moves-grid li');
    window.GameUI.renderMoves();
    expect(document.querySelector('#moves-grid li')).toBe(node);
    expect(grid()).toHaveLength(5);
  });

  test.each([
    ['undo by 1', 9, (h) => h.slice(0, 8)],
    ['undo by 2', 9, (h) => h.slice(0, 7)],
    ['undo 2 then one new move (same length − 1, different last)', 9, (h) => h.slice(0, 7).concat([{ x: 14, y: 14, color: 'BLACK' }])],
    ['resync replaces the history with another game of the same length', 6, (h) => h.map((m) => ({ ...m, x: 14 - m.x }))],
    ['a new game (history restarts)', 9, () => hist(2)],
  ])('%s → full rebuild matching the new history', (_n, k, next) => {
    setup({ moveHistory: hist(k) });
    window.GameUI.renderMoves();
    const h = next(hist(k));
    window.RoomState.gameState.moveHistory = h;
    window.GameUI.renderMoves();
    const got = { pairs: pairs(), grid: grid(), cur: cur() };
    // compare with a from-scratch render of exactly h
    document.body.innerHTML = '';
    setup({ moveHistory: [] });
    window.GameUI.renderMoves();
    window.RoomState.gameState.moveHistory = h;
    window.GameUI.renderMoves();
    expect(got).toEqual({ pairs: pairs(), grid: grid(), cur: cur() });
    expect(got.grid).toHaveLength(h.length);
  });

  test('back to no moves → placeholder in both lists', () => {
    setup({ moveHistory: hist(3) });
    window.GameUI.renderMoves();
    window.RoomState.gameState.moveHistory = [];
    window.GameUI.renderMoves();
    expect(document.querySelector('#moves-list .moves__empty')).not.toBeNull();
    expect(document.querySelector('#moves-grid .moves__empty')).not.toBeNull();
  });
});

// perf/play-lag: renderGameControls() runs on every move. Rewriting identical tiles and forcing a
// board resize() (sync re-layout + second full board redraw) each time was a per-move cost (#90).
describe('action tiles — rewrite / resize only on change', () => {
  function withResizeSpy() {
    const resize = jest.fn();
    window.RoomState.boardRenderer = { resize };
    return resize;
  }
  test('same tiles twice → no DOM rewrite, no resize; a real change → both', () => {
    setup();
    const resize = withResizeSpy();
    window.GameUI.renderGameControls();
    expect(resize).toHaveBeenCalledTimes(1);
    const btn = tile('doResign');
    window.GameUI.renderGameControls();
    window.GameUI.renderGameControls();
    expect(resize).toHaveBeenCalledTimes(1);
    expect(tile('doResign')).toBe(btn);
    window.RoomState.undoOfferPending = { from: 'me' };
    window.GameUI.renderGameControls();
    expect(resize).toHaveBeenCalledTimes(2);
    expect(tile('doUndoRequest').disabled).toBe(true);
  });

  test('spectator: empty controls are not re-fitted on every move', () => {
    setup({ me: false });
    const resize = withResizeSpy();
    window.GameUI.renderGameControls();
    window.GameUI.renderGameControls();
    expect(resize).toHaveBeenCalledTimes(1);
  });

  test('arming a two-tap tile still re-renders it', () => {
    setup();
    jest.useFakeTimers();
    window.GameUI.renderGameControls();
    window.doResign(); // first tap arms → the tile must change even though nothing else did
    expect(tile('doResign').classList.contains('act--confirm')).toBe(true);
    jest.advanceTimersByTime(3100); // the arm expires → back to the plain tile
    expect(tile('doResign').classList.contains('act--confirm')).toBe(false);
  });
});

