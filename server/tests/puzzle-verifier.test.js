'use strict';

/**
 * PuzzleVerifier (#331): forcing-line replay of solver-only answers under each rule, walls and portals.
 */

const { verifyAnswers, MAX_STEPS } = require('../managers/PuzzleVerifier');

const B = (x, y) => ({ x, y, color: 'BLACK' });
const W = (x, y) => ({ x, y, color: 'WHITE' });
const at = (x, y) => ({ x, y });
const verify = (stones, line, over = {}) => verifyAnswers({ size: 15, rule: 'freestyle', toMove: 'BLACK', stones, ...over }, [line])[0];

describe('PuzzleVerifier', () => {
  const closedThree = [W(2, 7), B(3, 7), B(4, 7), B(5, 7)];     // W B B B _ _ on row 8
  const openThree = [B(5, 12), B(6, 12), B(7, 12)];             // _ _ B B B _ _ on row 13

  it('a move making five is verified at that step', () => {
    expect(verify([B(3, 7), B(4, 7), B(5, 7), B(6, 7)], [at(7, 7)])).toEqual({ status: 'verified', step: 1, reason: 'five' });
  });

  it('a four forces the single block, then an open four wins', () => {
    expect(verify([...closedThree, ...openThree], [at(6, 7), at(8, 12)])).toEqual({ status: 'verified', step: 2, reason: 'open_four' });
  });

  it('a move onto the forced block breaks the line', () => {
    expect(verify(closedThree, [at(6, 7), at(7, 7)])).toEqual({ status: 'breaks', step: 2, reason: 'occupied' });
  });

  it('ignoring the opponent\'s four breaks the line; blocking it does not', () => {
    const wFour = [W(0, 0), W(1, 0), W(2, 0), W(3, 0)];
    expect(verify([...wFour, ...closedThree], [at(6, 7)])).toEqual({ status: 'breaks', step: 1, reason: 'opponent_five' });
    expect(verify([...wFour, ...closedThree], [at(4, 0)]).status).toBe('unchecked');
  });

  it('the forced block giving the opponent a four must be answered next', () => {
    // White already holds x=7, y=8..10; the forced block at (7,7) turns it into a four black ignores.
    const s = [...closedThree, W(7, 8), W(7, 9), W(7, 10)];
    expect(verify(s, [at(6, 7), at(10, 3)])).toEqual({ status: 'breaks', step: 2, reason: 'opponent_five' });
  });

  it('quiet moves and a line ending on a lone four are unchecked (VCT / 4-3 is the reviewer\'s call)', () => {
    expect(verify(openThree, [at(12, 2)])).toEqual({ status: 'unchecked', step: 1, reason: 'not_forcing' });
    expect(verify(closedThree, [at(6, 7)])).toEqual({ status: 'unchecked', step: 1, reason: 'ends_with_four' });
  });

  it('standard: an overline is not a win', () => {
    const s = [B(1, 7), B(2, 7), B(3, 7), B(4, 7), B(6, 7)];
    expect(verify(s, [at(5, 7)]).status).toBe('verified');
    expect(verify(s, [at(5, 7)], { rule: 'standard' }).status).toBe('unchecked');
  });

  it('caro: a closed four has two defences (completion point or the cell beyond), so it does not force; an open four still wins', () => {
    const line = [at(6, 7), at(8, 12)];
    expect(verify([...closedThree, ...openThree], line, { rule: 'caro' })).toEqual({ status: 'unchecked', step: 1, reason: 'not_forcing' });
    expect(verify(openThree, [at(8, 12)], { rule: 'caro' })).toEqual({ status: 'verified', step: 1, reason: 'open_four' });
  });

  it('caro: a five blocked on both ends is not a win', () => {
    const s = [W(2, 7), B(3, 7), B(4, 7), B(5, 7), B(6, 7), W(8, 7)];
    expect(verify(s, [at(7, 7)]).status).toBe('verified');
    expect(verify(s, [at(7, 7)], { rule: 'caro' }).status).toBe('unchecked');
  });

  it('white to move works the same way', () => {
    expect(verify([W(3, 7), W(4, 7), W(5, 7), W(6, 7)], [at(7, 7)], { toMove: 'WHITE' }).reason).toBe('five');
  });

  it('a line through a portal counts; a wall cell cannot be played', () => {
    const s = [B(3, 7), B(4, 7), B(11, 7), B(12, 7)];
    const portals = [{ a: at(5, 7), b: at(10, 7) }];
    expect(verify(s, [at(13, 7)], { portals }).reason).toBe('five');
    expect(verify(s, [at(13, 7)]).status).toBe('unchecked');
    expect(verify(s, [at(1, 1)], { walls: [at(1, 1)] })).toEqual({ status: 'breaks', step: 1, reason: 'occupied' });
  });

  it('stops at the step budget across all lines of a puzzle', () => {
    const lines = Array.from({ length: MAX_STEPS + 1 }, () => [at(12, 2)]);
    const v = verifyAnswers({ size: 15, rule: 'freestyle', toMove: 'BLACK', stones: [B(0, 0), W(14, 14)] }, lines);
    expect(v[MAX_STEPS - 1].reason).toBe('not_forcing');
    expect(v[MAX_STEPS]).toEqual({ status: 'unchecked', step: 1, reason: 'budget' });
  });
});
