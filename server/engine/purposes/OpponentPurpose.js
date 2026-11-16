'use strict';
const { Purpose, playedMove, clampInt } = require('./Purpose');
const { hasSpecialBoard } = require('../RuleMapper');

// Placeholder difficulty table (planning open question 3) — tune with real benchmarks.
const DIFFICULTY = Object.freeze({
  easy:   { STRENGTH: 30,  MAX_NODE: 500,    budgetMs: 2000 },
  normal: { STRENGTH: 70,  MAX_NODE: 5000,   budgetMs: 5000 },
  hard:   { STRENGTH: 100, MAX_NODE: 50000,  budgetMs: 10000 },
});

class OpponentPurpose extends Purpose {
  get name() { return 'opponent'; }
  _level(ctx) { return DIFFICULTY[ctx.difficulty] || DIFFICULTY.normal; }
  config(ctx) {
    const lv = this._level(ctx);
    const style = clampInt(ctx.style, 0, 3, 0);
    const cfg = {
      STRENGTH: lv.STRENGTH, MAX_NODE: lv.MAX_NODE, SHOW_DETAIL: 0, PONDERING: 0,
      // Style acts only at STRENGTH 100 on wall/portal/torus boards; elsewhere the engine plays Normal.
      STYLE: lv.STRENGTH === 100 && hasSpecialBoard(ctx.state) ? style : 0,
    };
    if (cfg.STYLE) cfg.STYLE_MARGIN = clampInt(ctx.styleMargin, 0, 6000, 60);
    return cfg;
  }
  search(ctx) {
    const lv = this._level(ctx);
    const clock = Number.isInteger(ctx.clockMs) ? Math.max(200, ctx.clockMs) : Infinity;
    return { nbest: 1, constrained: true, deadlineMs: Math.min(lv.budgetMs, clock) };
  }
  parse(events) {
    const m = playedMove(events);
    return m && !m.swap ? { move: m } : { move: null };
  }
}

module.exports = { OpponentPurpose, DIFFICULTY };
