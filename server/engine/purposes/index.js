'use strict';
const { OpponentPurpose } = require('./OpponentPurpose');
const { AnalysisPurpose } = require('./AnalysisPurpose');
const { VerifyPurpose } = require('./VerifyPurpose');
const { HintPurpose } = require('./HintPurpose');

/** Adding a purpose = one class + one entry here. */
function defaultRegistry() {
  const r = new Map();
  for (const P of [OpponentPurpose, AnalysisPurpose, VerifyPurpose, HintPurpose]) { const p = new P(); r.set(p.name, p); }
  return r;
}

module.exports = { defaultRegistry };
