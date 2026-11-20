'use strict';
// #425 — Renju in GameEngine: Black loses on a forbidden move, exactly-5 / 5+ wins, Renju+WALL skips the wall opening rules.
const { GameEngine } = require('../managers/GameEngine');

const B = 'black-p';
const W = 'white-p';
function game(opts = {}) {
  return new GameEngine({
    roomId: 'r', boardSize: 15, walls: [], portals: [], firstMoveZones: [], winningRule: 'renju',
    players: [{ userId: B, displayName: 'B', color: 'BLACK' }, { userId: W, displayName: 'W', color: 'WHITE' }],
    ...opts,
  });
}
/** Alternate B/W moves; returns the last result. */
function play(g, moves) {
  let r;
  moves.forEach(([x, y], i) => { r = g.makeMove(i % 2 === 0 ? B : W, x, y); });
  return r;
}
// White fillers far from Black's shapes, no two adjacent so White never threatens.
const FILL = [[0, 0], [0, 2], [0, 4], [0, 6], [0, 8], [0, 10]];
const withFill = (blacks) => blacks.flatMap((b, i) => (i < blacks.length - 1 ? [b, FILL[i]] : [b]));

describe('Renju forbidden moves', () => {
  test('double-three: Black loses at once, White is the winner, reason forbidden', () => {
    const g = game();
    const r = play(g, [...withFill([[5, 7], [6, 7], [7, 5], [7, 6]]), FILL[3], [7, 7]]);
    expect(r).toMatchObject({ won: true, forbidden: 'double_three', color: 'BLACK', nextTurn: null });
    expect(g.status).toBe('finished');
    expect(g.result).toEqual({ winner: W, reason: 'forbidden', forbidden: 'double_three' });
    expect(g.board[7][7]).toBe(1); // the stone is on the board (shown to both players)
  });

  test('the same position is legal under freestyle', () => {
    const g = game({ winningRule: 'freestyle' });
    const r = play(g, [...withFill([[5, 7], [6, 7], [7, 5], [7, 6]]), FILL[3], [7, 7]]);
    expect(r.won).toBeUndefined();
    expect(g.status).toBe('ongoing');
  });

  test('White is never restricted: a double three is fine, and 6 in a row wins', () => {
    const g = game();
    g.board[7][5] = 2; g.board[7][6] = 2; g.board[7][7] = 2; g.board[7][8] = 2; g.board[7][9] = 2; g.board[7][10] = 2;
    expect(g._checkWin(10, 7, 2)).not.toBeNull();
  });

  test('Black exactly five wins; Black overline does not count as a win', () => {
    const g = game();
    for (let x = 3; x < 8; x++) g.board[7][x] = 1;
    expect(g._checkWin(7, 7, 1)).toHaveLength(5);
    g.board[7][8] = 1;
    expect(g._checkWin(8, 7, 1)).toBeNull();
  });

  test('a five that is also forbidden-shaped still wins', () => {
    const g = game();
    // row five at (7,7) plus a column overline through it
    const blacks = [[3, 7], [4, 7], [5, 7], [6, 7], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]];
    blacks.forEach(([x, y]) => { g.board[y][x] = 1; });
    g.moveHistory = []; g.moveCount = 8; // Black to move (even count of plies played)
    const r = g.makeMove(B, 7, 7);
    expect(r).toMatchObject({ won: true, color: 'BLACK' });
    expect(r.forbidden).toBeUndefined();
    expect(g.result.winner).toBe(B);
    expect(g.result.reason).toBe('win');
  });
});

describe('Renju + WALL', () => {
  test('skips the first-move zone and the 2nd-move distance rule', () => {
    const g = game({ walls: [{ x: 3, y: 3 }], firstMoveZones: [{ x: 4, y: 3 }] });
    expect(g.makeMove(B, 7, 7).error).toBeUndefined(); // not in a zone
    g.makeMove(W, 0, 0);
    expect(g.makeMove(B, 8, 7).error).toBeUndefined(); // distance 1 < 4
  });
  test('other rules keep the wall opening rule', () => {
    const g = game({ winningRule: 'freestyle', walls: [{ x: 3, y: 3 }], firstMoveZones: [{ x: 4, y: 3 }] });
    expect(g.makeMove(B, 7, 7).code).toBe('SWAP2_FIRST_MOVE_MUST_BE_ADJACENT_WALL');
  });
  test('a wall is a blocker for the forbidden-move check', () => {
    const g = game({ walls: [{ x: 4, y: 7 }] });
    const r = play(g, [...withFill([[5, 7], [6, 7], [7, 5], [7, 6]]), FILL[3], [7, 7]]);
    expect(r.forbidden).toBeUndefined(); // the row three is closed by the wall
  });
});

describe('Renju opening name', () => {
  test('a RIF opening is named after move 3 (Chosei = J9 + K10)', () => {
    const g = game();
    play(g, [[7, 7], [8, 6], [9, 5]]);
    expect(g.opening).toEqual({ group: 'indirect', no: 1, name: 'Chosei' });
  });
  test('anything else is free-open (null)', () => {
    const g = game();
    play(g, [[7, 7], [12, 12], [9, 5]]);
    expect(g.opening).toBeNull();
  });
  test('no label for other rules', () => {
    const g = game({ winningRule: 'freestyle' });
    play(g, [[7, 7], [8, 6], [9, 5]]);
    expect(g.opening).toBeNull();
  });
});
