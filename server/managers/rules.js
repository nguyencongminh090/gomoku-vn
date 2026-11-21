'use strict';
/**
 * rules.js — the winning-rule enum, one source for rooms, tournaments, puzzles, ratings and challenges (#425).
 * `schema` CHECK lists (ratings.category) mirror WINNING_RULES via migrations; add a migration when this changes.
 */

/** Every rule a room / tournament / challenge / rating pool can use. */
const WINNING_RULES = Object.freeze(['freestyle', 'standard', 'caro', 'renju']);

/** Rules offered by quick-match (Renju is not: its Black restrictions are not for random pairing yet). */
const QUICK_RULES = Object.freeze(['freestyle', 'standard', 'caro']);

/** Rules a puzzle can be authored for. */
const PUZZLE_RULES = WINNING_RULES;

module.exports = { WINNING_RULES, QUICK_RULES, PUZZLE_RULES };
