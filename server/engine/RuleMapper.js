'use strict';
// gomoku-vn settings → engine protocol lines (engine-integration §4). Lines are built ONLY from validated integers/enums.
const { RULE_IDS, WALL_SECOND_MOVE_DISTANCE, ERR, EngineError } = require('./constants');
const { sideToMove } = require('./normalizer');

const isInt = Number.isInteger;

/** game: GameEngine → EngineGameState. Moves in play order (mover alternates BLACK first). */
function stateFromGame(game) {
  return {
    boardSize: game.boardSize,
    winningRule: game.settings && game.settings.winningRule,
    walls: game.walls || [],
    portals: game.portals || [],
    torus: false,
    firstMoveZones: game.firstMoveZones || [],
    moves: (game.moveHistory || []).map((m) => ({ x: m.x, y: m.y })),
  };
}

function validateState(s) {
  const bad = (d) => { throw new EngineError(ERR.BAD_STATE, d); };
  if (!s || !isInt(s.boardSize) || s.boardSize < 5 || s.boardSize > 22) bad('boardSize');
  const n = s.boardSize;
  const inb = (c) => c && isInt(c.x) && isInt(c.y) && c.x >= 0 && c.y >= 0 && c.x < n && c.y < n;
  for (const w of s.walls || []) if (!inb(w)) bad('wall');
  for (const p of s.portals || []) if (!p || !inb(p.a) || !inb(p.b)) bad('portal');
  for (const z of s.firstMoveZones || []) if (!inb(z)) bad('zone');
  for (const m of s.moves || []) if (!inb(m)) bad('move');
}

function ruleId(state) {
  const id = RULE_IDS[state.winningRule || 'freestyle'];
  if (id === undefined) throw new EngineError(ERR.RULE_UNSUPPORTED, String(state.winningRule));
  return id;
}

const hasSpecialBoard = (s) => (s.walls || []).length > 0 || (s.portals || []).length > 0 || !!s.torus;
const hasWalls = (s) => (s.walls || []).length > 0;

/** START + torus + portals. START clears walls/portals/torus, so everything follows it. */
function shapeLines(s) {
  const out = [`START ${s.boardSize}`];
  if (s.torus) out.push('INFO TORUS 1');
  if ((s.portals || []).length > 0) {
    out.push('INFO CLEARPORTALS');
    for (const p of s.portals) out.push(`INFO YXPORTAL ${p.a.x},${p.a.y} ${p.b.x},${p.b.y}`);
  }
  return out;
}

/** YXBOARD block: walls (3) first, then stones in move order alternating 1,2 (no search). */
function positionLines(s) {
  const out = ['YXBOARD'];
  for (const w of s.walls || []) out.push(`${w.x},${w.y},3`);
  (s.moves || []).forEach((m, i) => out.push(`${m.x},${m.y},${i % 2 === 0 ? 1 : 2}`));
  out.push('DONE');
  return out;
}

/** True when the next move is the game's first on a wall board (must lie in firstMoveZones). */
function isZoneFirstMove(s) {
  return hasWalls(s) && (s.moves || []).length === 0 && (s.firstMoveZones || []).length > 0;
}

/** Root exclusions. `blocked` = extra cells (rejected engine moves). */
function constraintLines(s, blocked = []) {
  const out = ['YXBLOCKRESET'];
  const cells = blocked;
  if (cells.length) { out.push('YXBLOCK'); cells.forEach((c) => out.push(`${c.x},${c.y}`)); out.push('DONE'); }
  return out;
}

/**
 * The search command. YXPLAYSELF/YXOPPDIST are SEARCH commands (single PV, verified on the native binary), not config:
 * Black's 2nd stone must be >= 4 from its 1st, so Black to move with 1 own stone → `YXPLAYSELF 4`;
 * White to move after Black's 1st stone → `YXOPPDIST 4` (filters Black's reply at ply 1). Else `YXNBEST n`.
 * Only `constrained` purposes (opponent, hint) use them; analysis/verify ignore the wall-rule distance.
 */
function searchCommand(s, nbest, constrained) {
  if (constrained && hasWalls(s)) {
    const n = (s.moves || []).length;
    if (n === 2) return `YXPLAYSELF ${WALL_SECOND_MOVE_DISTANCE}`;
    if (n === 1) return `YXOPPDIST ${WALL_SECOND_MOVE_DISTANCE}`;
  }
  return `YXNBEST ${nbest}`;
}

module.exports = {
  searchCommand, stateFromGame, validateState, ruleId, hasSpecialBoard, hasWalls, shapeLines, positionLines,
  isZoneFirstMove, constraintLines, sideToMove,
};
