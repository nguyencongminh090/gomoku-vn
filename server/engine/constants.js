'use strict';

/** Win-rate scale of the bundled model (`Model20260727-V0-FreshValue.bin`); NOT the engine default 200.
 *  Re-extract when the model file changes (backend-design §11.1). */
const ENGINE_SCALING_FACTOR = 131.3979;

/** Display cap for the eval bar when a mate score has to be plotted as a number. */
const MATE_BAR_VALUE = 10000;

const RULE_IDS = Object.freeze({ freestyle: 0, standard: 1, caro: 8 });

/** Bot games use the wall rule: 2nd stone of the first mover is >= 4 (Chebyshev) from the 1st. */
const WALL_SECOND_MOVE_DISTANCE = 4;

const ERR = Object.freeze({
  RULE_UNSUPPORTED: 'ENGINE_RULE_UNSUPPORTED',
  BAD_STATE: 'ENGINE_BAD_STATE',
  UNKNOWN_PURPOSE: 'ENGINE_UNKNOWN_PURPOSE',
  DESYNC: 'ENGINE_DESYNC',
  ENGINE_ERROR: 'ENGINE_ERROR',
  TIMEOUT: 'ENGINE_TIMEOUT',
  STALE: 'ENGINE_STALE',
  HINT_FORBIDDEN: 'ENGINE_HINT_FORBIDDEN',
  NO_LEGAL_MOVE: 'ENGINE_NO_LEGAL_MOVE',
});

/** Error with a stable machine code (never a user-facing string). */
class EngineError extends Error {
  constructor(code, detail) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'EngineError';
    this.code = code;
  }
}

module.exports = {
  ENGINE_SCALING_FACTOR, MATE_BAR_VALUE, RULE_IDS, WALL_SECOND_MOVE_DISTANCE, ERR, EngineError,
};
