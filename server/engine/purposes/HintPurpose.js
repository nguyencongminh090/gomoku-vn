'use strict';
const { AnalysisPurpose } = require('./AnalysisPurpose');
const { ERR, EngineError } = require('../constants');

/** Best move + line. Forbidden in rated human games (caller sets ctx.rated). Rate limiting belongs to the lease layer (F405). */
class HintPurpose extends AnalysisPurpose {
  get name() { return 'hint'; }
  authorize(ctx) { if (ctx.rated === true) throw new EngineError(ERR.HINT_FORBIDDEN, 'rated'); }
  config(ctx) { return super.config({ ...ctx, maxNode: ctx.maxNode || 50000 }); }
  search() { return { nbest: 1, constrained: true, deadlineMs: 8000 }; }
  parse(events, ctx) {
    const a = super.parse(events, ctx);
    const best = a.played && !a.played.swap ? a.played : (a.best && a.best.line[0]) || null;
    return { move: best, line: a.best ? a.best.line : [], eval: a.best ? a.best.evalBlack : null, analysis: a };
  }
}

module.exports = { HintPurpose };
