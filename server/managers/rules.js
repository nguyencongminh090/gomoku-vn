'use strict';
/**
 * rules.js — the winning-rule enum, one source for rooms, tournaments, puzzles, ratings and challenges (#425).
 * `schema` CHECK lists (ratings.category) mirror WINNING_RULES via migrations; add a migration when this changes.
 */

/** Every rule a room / tournament / challenge / rating pool can use. */
const WINNING_RULES = Object.freeze(['freestyle', 'standard', 'caro', 'renju']);

/** Rules offered by quick-match (Renju is not: its Black restrictions are not for random pairing yet). */
const QUICK_RULES = Object.freeze(['freestyle', 'standard', 'caro']);

/** Renju opening procedures (#427); null = free opening. */
const OPENING_RULES = Object.freeze(['taraguchi10', 'yamaguchi']);

/**
 * Normalise `raw.openingRule` onto already-normalised settings `s` (winningRule, boardSize, rule* set).
 * Kept only with Renju on 15x15; forces Swap2, walls and portals off (the zones are around a plain centre).
 */
function applyOpeningRule(s, raw) {
  const ok = OPENING_RULES.includes(raw && raw.openingRule) && s.winningRule === 'renju' && s.boardSize === 15;
  s.openingRule = ok ? raw.openingRule : null;
  if (ok) { s.ruleSwap2 = false; s.ruleWall = false; s.rulePortal = false; }
  return s;
}

/** Rules a puzzle can be authored for. */
const PUZZLE_RULES = WINNING_RULES;

module.exports = { WINNING_RULES, QUICK_RULES, PUZZLE_RULES, OPENING_RULES, applyOpeningRule };
