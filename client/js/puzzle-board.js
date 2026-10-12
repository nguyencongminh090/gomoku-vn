/**
 * puzzle-board.js — shared puzzle → BoardRenderer state (#203). Pure; no DOM.
 * Stones are {x, y, color:'BLACK'|'WHITE'}; opts.walls [{x,y}] / opts.portals [{a,b}] are drawn as -1 / -2; `extra` are cells (solver/answer moves) drawn in
 * `toMove`'s colour. BoardRenderer values: 0 empty, 1 black, 2 white.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PuzzleBoard = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function state(size, stones, toMove, extra, opts) {
    const o = opts || {};
    const walls = o.walls || [];
    const portals = o.portals || [];
    const board = Array.from({ length: size }, () => new Array(size).fill(0));
    for (const w of walls) if (w.x < size && w.y < size) board[w.y][w.x] = -1;
    for (const p of portals) for (const c of [p.a, p.b]) if (c && c.x < size && c.y < size) board[c.y][c.x] = -2;
    for (const s of stones) if (s.x < size && s.y < size) board[s.y][s.x] = s.color === 'BLACK' ? 1 : 2;
    const mine = toMove === 'BLACK' ? 1 : 2;
    const cells = (extra || []).filter((c) => c.x < size && c.y < size);
    for (const m of cells) board[m.y][m.x] = mine;
    return {
      boardSize: size,
      board,
      walls,
      portals,
      lastMove: cells.length ? cells[cells.length - 1] : null,
      winLine: null,
      firstMoveZones: [],
      showZones: false,
      interactive: !!o.interactive,
      isMyTurn: !!o.interactive,
      myColor: o.myColor || toMove,
    };
  }
  return { state };
}));
