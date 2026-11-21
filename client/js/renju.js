'use strict';

/**
 * renju.js — Black's forbidden moves under the RIF Renju rules (TODO.md #425).
 *
 * UMD, pure (no DOM): `require()`-able from Node and attaches to `globalThis.Renju` in the browser.
 * Board = array of rows, board[y][x]: 0 empty, 1 BLACK, 2 WHITE, anything else (wall -1, portal -2) = a blocker,
 * exactly like the board edge. Rules: docs/knowledge/renju-rif-rules.md (RIF s.9).
 *
 *   forbiddenReason(board, x, y) → null | 'overline' | 'double_four' | 'double_three'   (Black, cell must be empty)
 *   forbiddenPoints(board)       → [{x, y, reason}]   every empty cell Black may not play
 *   exactFive(board, x, y)       → true when a Black stone at (x, y) makes exactly five (it wins, forbidden or not)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Renju = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const EMPTY = 0;
  const BLACK = 1;
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  // Work cap per top-level check: the RIF 9.3 recursion is bounded by depth, but a crafted board (a user-authored puzzle)
  // could still fan out. When the budget runs out the move is treated as FORBIDDEN ('double_three', the shape that
  // needs the recursion) — fail closed, deterministic, so server and client agree. The throw unwinds the whole
  // recursion, so a cut-off never reads as "playable" inside isThree. Real positions use a few dozen nodes.
  const NODE_BUDGET = 4000;
  let budget = NODE_BUDGET;
  const OVER_BUDGET = { overBudget: true };
  const REACH = 7; // cells read each side of the centre; a five spans <= 4, plus 2 beyond to measure the run

  /** The line through (x, y) as an array of 'B' / '.' / 'X' (blocker or off-board), centre at index REACH. */
  function line(board, x, y, dx, dy) {
    const n = board.length;
    const out = [];
    for (let k = -REACH; k <= REACH; k++) {
      const cx = x + dx * k;
      const cy = y + dy * k;
      if (cx < 0 || cy < 0 || cx >= n || cy >= n) { out.push('X'); continue; }
      const v = board[cy][cx];
      out.push(v === BLACK ? 'B' : v === EMPTY ? '.' : 'X');
    }
    return out;
  }

  /** Length of the unbroken B run that contains index i (0 when cells[i] is not B). */
  function runAt(cells, i) {
    if (cells[i] !== 'B') return 0;
    let a = i;
    let b = i;
    while (a > 0 && cells[a - 1] === 'B') a--;
    while (b < cells.length - 1 && cells[b + 1] === 'B') b++;
    return b - a + 1;
  }

  /** Empty indexes of the line that would make EXACTLY five (Black's overline never counts as a four). */
  function fiveMakers(cells) {
    const out = [];
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] !== '.') continue;
      cells[i] = 'B';
      if (runAt(cells, i) === 5) out.push(i);
      cells[i] = '.';
    }
    return out;
  }

  /** Number of fours on this line: a straight four (makers 5 apart) is one four, two split fours are two. */
  function foursOf(cells) {
    const m = fiveMakers(cells);
    if (m.length === 2 && m[1] - m[0] === 5) return 1;
    return m.length;
  }

  /** True when a stone at (x, y) (already placed) makes exactly five on some line. */
  function placedFive(board, x, y) {
    return DIRS.some(([dx, dy]) => runAt(line(board, x, y, dx, dy), REACH) === 5);
  }

  /** Does the placed stone at (x, y) make a straight four on this line (two different ways to five)? */
  function straightFour(cells) {
    const m = fiveMakers(cells);
    return m.length === 2 && m[1] - m[0] === 5;
  }

  /**
   * Black stone at (x, y) is already on the board. Is the line a real three: one more Black stone (at a point that
   * is not itself forbidden — RIF 9.3 recursion) turns it into a straight four?
   */
  function isThree(board, x, y, dx, dy, depth) {
    const cells = line(board, x, y, dx, dy);
    if (foursOf(cells) > 0) return false; // already a four on this line
    for (let k = -4; k <= 4; k++) {
      if (k === 0 || cells[REACH + k] !== '.') continue;
      cells[REACH + k] = 'B';
      const four = straightFour(cells) && runAt(cells, REACH + k) === 4;
      cells[REACH + k] = '.';
      if (!four) continue;
      const qx = x + dx * k;
      const qy = y + dy * k;
      if (!reasonPlaced(board, qx, qy, depth + 1)) return true; // q is playable -> this three counts
    }
    return false;
  }

  /** Reason Black may not have a stone at (x, y), the stone being placed on `board` for the call. */
  function reasonPlaced(board, x, y, depth) {
    if (board[y][x] !== EMPTY) return null;
    if (--budget < 0) throw OVER_BUDGET;
    board[y][x] = BLACK;
    try {
      if (placedFive(board, x, y)) return null; // five wins even when the shape is forbidden
      const lines = DIRS.map(([dx, dy]) => line(board, x, y, dx, dy));
      if (lines.some((c) => runAt(c, REACH) >= 6)) return 'overline';
      if (lines.reduce((s, c) => s + foursOf(c), 0) >= 2) return 'double_four';
      if (depth > 6) return null;
      let threes = 0;
      for (const [dx, dy] of DIRS) {
        if (isThree(board, x, y, dx, dy, depth) && ++threes >= 2) return 'double_three'; // stop at the second three
      }
      return null;
    } finally {
      board[y][x] = EMPTY;
    }
  }

  function forbiddenReason(board, x, y) {
    return topLevel(board, x, y);
  }

  function topLevel(board, x, y) {
    budget = NODE_BUDGET;
    try { return reasonPlaced(board, x, y, 0); } catch (e) {
      if (e === OVER_BUDGET) return 'double_three';
      throw e;
    }
  }

  function exactFive(board, x, y) {
    if (board[y][x] !== EMPTY) return false;
    board[y][x] = BLACK;
    try { return placedFive(board, x, y); } finally { board[y][x] = EMPTY; }
  }

  function forbiddenPoints(board) {
    const out = [];
    for (let y = 0; y < board.length; y++) {
      for (let x = 0; x < board.length; x++) {
        const reason = board[y][x] === EMPTY ? topLevel(board, x, y) : null;
        if (reason) out.push({ x, y, reason });
      }
    }
    return out;
  }

  return { forbiddenReason, forbiddenPoints, exactFive };
}));
