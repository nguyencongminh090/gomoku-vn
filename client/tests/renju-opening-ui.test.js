/**
 * TODO.md #427 — Taraguchi-10 / Yamaguchi opening in the room: GameUI.renderSwap2() draws the step's
 * zone, offers, hint and buttons from gameState.swap2 (RenjuOpeningUI), and board clicks / buttons
 * emit the Swap2-transport events.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const JS = (name) => fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');

function setup(swap2, { currentTurn = 'me' } = {}) {
  document.body.innerHTML = `
    <div id="board-area"></div>
    <div id="game-toasts"><div id="draw-prompt-area"></div><div id="time-prompt-area"></div>
      <div id="undo-prompt-area"></div><div id="confirm-prompt-area"></div></div>
    <div id="tab-moves"><ol id="moves-list"></ol><ol id="moves-grid"></ol></div>
    <div id="game-controls"></div>`;
  window.requestAnimationFrame = (cb) => cb();
  const emits = [];
  window.RoomClient = { emit: (e, d) => emits.push([e, d]), emitAck() {}, on() { return this; } };
  const states = [];
  window.RoomState = {
    myUser: { userId: 'me' },
    boardRenderer: { setState: (s) => states.push(s), resize() {} },
    timerValues: { black: 60, white: 60 },
    predictedTurn: { active: false },
    gameState: {
      status: 'ongoing', rated: false, boardSize: 15, currentTurn, moveHistory: [], board: [], firstMoveZones: [], walls: [], portals: [],
      players: [{ userId: 'me', color: null, displayName: 'Me' }, { userId: 'them', color: null, displayName: 'Foe' }],
      swap2: { enabled: true, openingPhase: 'rx_' + swap2.step, firstPlayerId: 'me', secondPlayerId: 'them', colorsAssigned: false,
        tentativeBlackId: 'me', offers: [], maxN: 10, ...swap2 },
    },
  };
  window.eval(JS('i18n.js'));
  window.eval(JS('renju-opening-ui.js'));
  window.eval(JS('action-delegate.js'));
  window.eval(JS('game-ui.js'));
  window.GameUI.renderSwap2();
  return { emits, states, controls: document.getElementById('game-controls') };
}

test('place step: green zone = central 5x5, preview colour, hint names the zone', () => {
  const { states, controls } = setup({ rule: 'taraguchi10', step: 'place', stoneColor: 'BLACK', zone: 2 });
  const s = states.pop();
  expect(s.interactive).toBe(true);
  expect(s.myColor).toBe('BLACK');
  expect(s.showZones).toBe(true);
  expect(s.firstMoveZones).toHaveLength(25);
  expect(s.firstMoveZones).toContainEqual({ x: 5, y: 5 });
  expect(controls.textContent).toContain('5×5');
});

test('centre step shows no zone (one point) and asks for the centre', () => {
  const { states, controls } = setup({ rule: 'taraguchi10', step: 'place', stoneColor: 'BLACK', zone: 0 });
  expect(states.pop().showZones).toBe(false);
  expect(controls.textContent).toContain('tâm bàn');
});

test('swap step: Giữ màu / Đổi màu buttons emit game:swap2_choice', () => {
  const { emits, controls } = setup({ rule: 'taraguchi10', step: 'swap', choices: ['stay', 'swap'] });
  const btns = [...controls.querySelectorAll('[data-action="swap2Choose"]')];
  expect(btns.map((b) => b.dataset.arg)).toEqual(['stay', 'swap']);
  btns[1].click();
  expect(emits).toContainEqual(['game:swap2_choice', { choice: 'swap' }]);
});

test('Taraguchi choice step has three options incl. offering 10', () => {
  const { controls } = setup({ rule: 'taraguchi10', step: 'choice' });
  expect([...controls.querySelectorAll('[data-action="swap2Choose"]')].map((b) => b.dataset.arg)).toEqual(['stay', 'swap', 'offer']);
});

test('Yamaguchi declare: select 1..10 and Khai báo emits choice declare with n', () => {
  const { emits, controls } = setup({ rule: 'yamaguchi', step: 'declare' });
  const sel = controls.querySelector('.rx-declare-n');
  expect([...sel.options].map((o) => o.value)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  sel.value = '4';
  controls.querySelector('[data-action="rxDeclare"]').click();
  expect(emits).toContainEqual(['game:swap2_choice', { choice: 'declare', n: 4 }]);
});

test('pick step: offers drawn on the board; the opponent only sees a waiting line', () => {
  const offers = [{ x: 1, y: 1 }, { x: 3, y: 3 }];
  const mine = setup({ rule: 'yamaguchi', step: 'pick', offers, tentativeBlackId: 'them' });
  expect(mine.states.pop()).toMatchObject({ offers, interactive: true });
  expect(mine.controls.textContent).toContain('Trắng'); // you hold White
  const theirs = setup({ rule: 'yamaguchi', step: 'pick', offers }, { currentTurn: 'them' });
  expect(theirs.states.pop().interactive).toBe(false);
  expect(theirs.controls.querySelector('button[data-action="swap2Choose"]')).toBeNull();
  expect(theirs.controls.textContent).toContain('Đối thủ');
});

test('a board click during an offer step emits game:swap2_place', () => {
  setup({ rule: 'yamaguchi', step: 'offer', offerN: 2, stoneColor: 'BLACK' });
  // initBoard builds the real renderer; drive its click callback directly.
  let onCellClick;
  window.BoardRenderer = function (_c, opts) { onCellClick = opts.onCellClick; this.setState = () => {}; this.resize = () => {}; };
  window.RoomState.boardRenderer = null;
  window.RoomState.roomData = { settings: { boardSize: 15 } };
  const emits = [];
  window.RoomClient.emit = (e, d) => emits.push([e, d]);
  window.GameUI.initBoard();
  onCellClick(2, 9);
  expect(emits).toContainEqual(['game:swap2_place', { x: 2, y: 9 }]);
});
