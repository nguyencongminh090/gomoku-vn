'use strict';
const { Purpose, buildAnalysis, clampInt } = require('./Purpose');

/** Forced-win check for puzzles: deep single-PV search; reports mate for the side to move. */
class VerifyPurpose extends Purpose {
  get name() { return 'verify'; }
  config(ctx) {
    return { STRENGTH: 100, STYLE: 0, SHOW_DETAIL: 2, PONDERING: 0, MAX_NODE: clampInt(ctx.maxNode, 1000, 20000000, 2000000) };
  }
  search(ctx) { return { nbest: 1, deadlineMs: clampInt(ctx.deadlineMs, 1000, 120000, 30000) }; }
  parse(events, ctx) {
    const a = buildAnalysis(events, ctx);
    const e = a.best && a.best.eval;
    const mateIn = e && e.mateIn !== null ? e.mateIn : null;
    const first = a.played && !a.played.swap ? a.played : (a.best && a.best.line[0]) || null;
    return {
      forcedWin: mateIn !== null && mateIn > 0,
      mateInPlies: mateIn !== null && mateIn > 0 ? mateIn : null,
      mateInMoves: mateIn !== null && mateIn > 0 ? Math.ceil(mateIn / 2) : null,
      bestMove: first, analysis: a,
    };
  }
}

module.exports = { VerifyPurpose };
