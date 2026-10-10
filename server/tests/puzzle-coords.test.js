'use strict';

/** coords.js (TODO.md #203): letter + sequence-number notations, row direction, list parsing. */

const coords = require('../../client/js/coords');

const N = 15;

describe('letter form (row 1 at the bottom)', () => {
  it('H8 is the centre of 15×15; A1 bottom-left, O15 top-right', () => {
    expect(coords.parse('H8', N)).toEqual({ x: 7, y: 7 });
    expect(coords.parse('A1', N)).toEqual({ x: 0, y: 14 });
    expect(coords.parse('O15', N)).toEqual({ x: 14, y: 0 });
  });
  it('is case-insensitive and tolerates a space between letter and number', () => {
    expect(coords.parse('h8', N)).toEqual(coords.parse('H8', N));
    expect(coords.parse(' j 10 ', N)).toEqual({ x: 9, y: 5 });
  });
  it('rejects off-board columns/rows', () => {
    for (const bad of ['P8', 'H0', 'H16', 'Z1']) expect(coords.parse(bad, N)).toBeNull();
  });
  it('label() inverts parse()', () => {
    for (const [x, y] of [[0, 0], [7, 7], [14, 14], [3, 11]]) expect(coords.parse(coords.label(x, y, N), N)).toEqual({ x, y });
    expect(coords.label(7, 7, N)).toBe('H8');
  });
});

describe('sequence-number form (row 1 at the top)', () => {
  it('rows start at 1, 21, 41 … for size 15 (tens digit = row)', () => {
    expect(coords.parse('1', N)).toEqual({ x: 0, y: 0 });
    expect(coords.parse('15', N)).toEqual({ x: 14, y: 0 });
    expect(coords.parse('21', N)).toEqual({ x: 0, y: 1 });
    expect(coords.parse('281', N)).toEqual({ x: 0, y: 14 });
  });
  it("the user's examples: 122 = row 7 col 2, 133 = row 7 col 13", () => {
    expect(coords.parse('122', N)).toEqual({ x: 1, y: 6 });
    expect(coords.parse('133', N)).toEqual({ x: 12, y: 6 });
  });
  it('rejects the gaps between rows (16–20) and numbers past the board', () => {
    for (const bad of ['0', '16', '20', '296', '9999']) expect(coords.parse(bad, N)).toBeNull();
  });
  it('number() inverts parse()', () => {
    for (const [x, y] of [[0, 0], [14, 0], [1, 6], [14, 14]]) expect(coords.parse(String(coords.number(x, y, N)), N)).toEqual({ x, y });
  });
  it('letters and numbers flip row direction (same cell, different row numbers)', () => {
    expect(coords.parse('A1', N)).toEqual(coords.parse('281', N)); // bottom-left either way
    expect(coords.parse('A15', N)).toEqual(coords.parse('1', N)); // top-left either way
  });
});

describe('parseList', () => {
  it('splits on commas, semicolons and whitespace; mixes both forms', () => {
    expect(coords.parseList('H8, J9;122 133', N)).toEqual([
      { x: 7, y: 7 }, { x: 9, y: 6 }, { x: 1, y: 6 }, { x: 12, y: 6 },
    ]);
  });
  it('null for empty input or any invalid item', () => {
    for (const bad of ['', '   ', 'H8, Q99', 'hello', null, undefined]) expect(coords.parseList(bad, N)).toBeNull();
  });
});

describe('other board sizes (17, 19, 20)', () => {
  it('letters run to the last column of each size; centre-ish cells map back and forth', () => {
    expect(coords.parse('Q17', 17)).toEqual({ x: 16, y: 0 });
    expect(coords.parse('R17', 17)).toBeNull();
    expect(coords.parse('S19', 19)).toEqual({ x: 18, y: 0 });
    expect(coords.parse('T19', 19)).toBeNull();
    expect(coords.parse('T20', 20)).toEqual({ x: 19, y: 0 });
    for (const size of [17, 19, 20]) {
      for (const [x, y] of [[0, 0], [size - 1, size - 1], [5, 9]]) {
        expect(coords.parse(coords.label(x, y, size), size)).toEqual({ x, y });
        expect(coords.parse(String(coords.number(x, y, size)), size)).toEqual({ x, y });
      }
    }
  });
  it('sequence rows start at 1, 21, 41… for 17, 19 and 20 (stride 20); the gap numbers are invalid', () => {
    expect(coords.parse('21', 19)).toEqual({ x: 0, y: 1 });
    expect(coords.parse('19', 19)).toEqual({ x: 18, y: 0 });
    expect(coords.parse('20', 19)).toBeNull();
    expect(coords.parse('20', 20)).toEqual({ x: 19, y: 0 });
    expect(coords.parse('18', 17)).toBeNull();
  });
});
