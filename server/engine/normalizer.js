'use strict';
// Eval / win-rate / PV normalisation (backend-design §11). Pure functions.
const { ENGINE_SCALING_FACTOR, MATE_BAR_VALUE } = require('./constants');

/** '-45' | '+M3' | '-M2' | '+M*' → { raw, cp, mateIn } (side-to-move view; mateIn signed plies, '*' → null+db). */
function parseValue(raw) {
  const s = String(raw).trim();
  const m = /^([+-])M(\d+|\*)$/.exec(s);
  if (m) {
    const sign = m[1] === '-' ? -1 : 1;
    if (m[2] === '*') return { raw: s, cp: null, mateIn: null, mateDb: sign };
    return { raw: s, cp: null, mateIn: sign * Number(m[2]) };
  }
  const n = Number(s);
  return { raw: s, cp: Number.isFinite(n) ? n : null, mateIn: null };
}

function winrateFromCp(cp, S = ENGINE_SCALING_FACTOR) { return 1 / (1 + Math.exp(-cp / S)); }
function cpFromWinrate(w, S = ENGINE_SCALING_FACTOR, clamp = 6000) {
  if (w <= 0) return -clamp;
  if (w >= 1) return clamp;
  return Math.max(-clamp, Math.min(clamp, S * Math.log(w / (1 - w))));
}

/** Convert a side-to-move value into Black's view. stm = 'BLACK'|'WHITE'. */
function toBlackView(value, winrate, stm) {
  const f = stm === 'BLACK' ? 1 : -1;
  return {
    cp: value.cp === null ? null : f * value.cp,
    mateIn: value.mateIn === null ? null : f * value.mateIn,
    winrate: winrate === null || winrate === undefined ? null : (stm === 'BLACK' ? winrate : 1 - winrate),
  };
}

/** Number for the eval bar (Black's view); mates map to ±MATE_BAR_VALUE minus plies. */
function barValue(evalBlack) {
  if (evalBlack.mateIn !== null) return Math.sign(evalBlack.mateIn) * (MATE_BAR_VALUE - Math.abs(evalBlack.mateIn));
  return evalBlack.cp;
}

/** The engine repeats the first cell of a terminal-win PV ('6,7 6,7'); drop consecutive duplicates. */
function dedupeLine(cells) {
  const out = [];
  for (const c of cells) {
    const p = out[out.length - 1];
    if (!p || p.x !== c.x || p.y !== c.y) out.push(c);
  }
  return out;
}

function sideToMove(moveCount) { return moveCount % 2 === 0 ? 'BLACK' : 'WHITE'; }

module.exports = {
  parseValue, winrateFromCp, cpFromWinrate, toBlackView, barValue, dedupeLine, sideToMove,
};
