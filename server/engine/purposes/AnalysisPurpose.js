'use strict';
const { Purpose, buildAnalysis, clampInt } = require('./Purpose');

/** Multi-PV analysis. Always STYLE 0 (Troll evals are not comparable), full strength, structured INFO PV blocks. */
class AnalysisPurpose extends Purpose {
  get name() { return 'analysis'; }
  config(ctx) {
    return { STRENGTH: 100, STYLE: 0, SHOW_DETAIL: 2, PONDERING: 0, MAX_NODE: clampInt(ctx.maxNode, 100, 5000000, 100000) };
  }
  search(ctx) { return { nbest: clampInt(ctx.nbest, 1, 8, 3), deadlineMs: clampInt(ctx.deadlineMs, 500, 60000, 15000) }; }
  parse(events, ctx) { return buildAnalysis(events, ctx); }
}

module.exports = { AnalysisPurpose };
