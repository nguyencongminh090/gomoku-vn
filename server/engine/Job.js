'use strict';
const crypto = require('crypto');
const { validateState, ruleId, shapeLines, positionLines, constraintLines, searchCommand, sideToMove } = require('./RuleMapper');
const { ERR, EngineError } = require('./constants');

/** Command object: ordered protocol lines + how to read the result. `key` = hash of the lines (stale-drop, cache). */
class Job {
  constructor({ purpose, lines, stm, ctx, deadlineMs }) {
    this.id = crypto.randomUUID();
    this.purpose = purpose;
    this.lines = lines;
    this.stm = stm;
    this.ctx = ctx;
    this.deadlineMs = deadlineMs;
    this.key = crypto.createHash('sha1').update(lines.join('\n')).digest('hex');
  }
}

const isInt = Number.isInteger;
function infoLine(k, v) {
  if (!/^[A-Z_]+$/.test(k) || !(isInt(v))) throw new EngineError(ERR.BAD_STATE, `INFO ${k}`);
  return `INFO ${k} ${v}`;
}

const JobFactory = {
  /**
   * purpose: Purpose instance; input: { state, ...purpose options }; extra.blocked: cells to exclude from the root.
   * Line order: INFO config → START/portals → YXBOARD → constraints → search command (YXNBEST | YXPLAYSELF | YXOPPDIST).
   */
  create(purpose, input, extra = {}) {
    const state = input && input.state;
    validateState(state);
    const ctx = { ...input, blocked: extra.blocked || [] };
    purpose.authorize(ctx);
    const cfg = { RULE: ruleId(state), TIMEOUT_MATCH: 0, ...purpose.config(ctx) };
    const search = purpose.search(ctx);
    const lines = [
      ...Object.entries(cfg).map(([k, v]) => infoLine(k, v)),
      ...shapeLines(state),
      ...positionLines(state),
      ...constraintLines(state, ctx.blocked),
      searchCommand(state, search.nbest, !!search.constrained),
    ];
    return new Job({
      purpose: purpose.name, lines, stm: sideToMove(state.moves.length), ctx, deadlineMs: search.deadlineMs,
    });
  },
};

module.exports = { Job, JobFactory };
