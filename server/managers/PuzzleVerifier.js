'use strict';

/**
 * PuzzleVerifier — replays a puzzle answer as a forcing line (#331).
 *
 * Answers hold the solver's moves only, so the opponent's replies are known only while every solver
 * move leaves exactly one defending cell (a VCF; in caro a four can have two — the completion point or
 * the cell beyond — and is then not forcing). The replay uses GameEngine._checkWin, so the puzzle's
 * rule (standard = exactly five, caro = not blocked on both ends), walls and portals count exactly as
 * in a real game.
 *
 * Verdict per line:
 *   verified  — the line makes five, or leaves a four the opponent cannot stop, at `step` (1-based).
 *   breaks    — the line fails at `step`: `occupied` (the forced reply took that cell) or
 *               `opponent_five` (the opponent completes five first).
 *   unchecked — a move does not force a single reply (VCT, trap, defence, 4-3 fork…) or the step
 *               budget ran out; the reviewer decides.
 * Nothing here rejects a puzzle — breaks are shown to the reviewer as a flag.
 */

const { GameEngine, EMPTY, BLACK, WHITE } = require('./GameEngine');

/** Total replayed moves per puzzle; answers are uncapped, so past this the rest is `unchecked`. */
const MAX_STEPS = 200;

const COLOR = { BLACK, WHITE };

function engineFor(p) {
  const engine = new GameEngine({
    roomId: 'puzzle-verify', boardSize: p.size, winningRule: p.rule,
    players: [{ userId: 'b', displayName: 'b', color: 'BLACK' }, { userId: 'w', displayName: 'w', color: 'WHITE' }],
    walls: p.walls || [], portals: p.portals || [],
  });
  const base = engine.board.map((r) => r.slice());
  for (const s of p.stones) base[s.y][s.x] = COLOR[s.color];
  return { engine, base };
}

/** Empty cells where `color` would make a winning five now. */
function completions(engine, color) {
  const out = [];
  const { board, boardSize: n } = engine;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (board[y][x] !== EMPTY) continue;
      board[y][x] = color;
      if (engine._checkWin(x, y, color)) out.push({ x, y });
      board[y][x] = EMPTY;
    }
  }
  return out;
}

/**
 * Cells where one opponent stone leaves `me` no winning cell. Candidates are the completion points
 * and the empty cells around each would-be five: in caro a stone just beyond the line also stops it
 * (blocked on both ends), so a four can have more than one defence.
 */
function defences(engine, me, opp, points) {
  const { board, boardSize: n } = engine;
  const cand = new Map();
  const add = (x, y) => { if (x >= 0 && y >= 0 && x < n && y < n && board[y][x] === EMPTY) cand.set(`${x},${y}`, { x, y }); };
  for (const p of points) {
    board[p.y][p.x] = me;
    const five = engine._checkWin(p.x, p.y, me) || [];
    board[p.y][p.x] = EMPTY;
    add(p.x, p.y);
    for (const c of five) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) add(c.x + dx, c.y + dy);
  }
  return [...cand.values()].filter((r) => {
    board[r.y][r.x] = opp;
    const stopped = completions(engine, me).length === 0;
    board[r.y][r.x] = EMPTY;
    return stopped;
  });
}

function replay(engine, base, line, toMove, budget) {
  engine.board = base.map((r) => r.slice());
  const me = COLOR[toMove];
  const opp = me === BLACK ? WHITE : BLACK;
  for (let i = 0; i < line.length; i++) {
    if (budget.left-- <= 0) return { status: 'unchecked', step: i + 1, reason: 'budget' };
    const m = line[i];
    const step = i + 1;
    if (engine.board[m.y][m.x] !== EMPTY) return { status: 'breaks', step, reason: 'occupied' };
    engine.board[m.y][m.x] = me;
    if (engine._checkWin(m.x, m.y, me)) return { status: 'verified', step, reason: 'five' };
    if (completions(engine, opp).length) return { status: 'breaks', step, reason: 'opponent_five' };
    const points = completions(engine, me);
    if (!points.length) return { status: 'unchecked', step, reason: 'not_forcing' };
    const defs = defences(engine, me, opp, points);
    if (!defs.length) return { status: 'verified', step, reason: 'open_four' };
    if (defs.length > 1) return { status: 'unchecked', step, reason: 'not_forcing' };
    if (i === line.length - 1) return { status: 'unchecked', step, reason: 'ends_with_four' };
    engine.board[defs[0].y][defs[0].x] = opp; // the forced block
  }
  return { status: 'unchecked', step: line.length, reason: 'not_forcing' };
}

/**
 * @param p {size, rule, toMove, stones:[{x,y,color}], walls, portals}
 * @param answers [[{x,y}…]…]
 * @returns {{status, step, reason}[]} one verdict per answer line
 */
function verifyAnswers(p, answers) {
  const { engine, base } = engineFor(p);
  const budget = { left: MAX_STEPS };
  return answers.map((line) => replay(engine, base, line, p.toMove, budget));
}

module.exports = { verifyAnswers, MAX_STEPS };
