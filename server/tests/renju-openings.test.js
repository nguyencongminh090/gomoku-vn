'use strict';
// #425 — the 26 RIF openings are recognised by name under every rotation/reflection; anything else is free-open (null).
const { OPENINGS, detectOpening } = require('../../client/js/renju-openings');

const SIZE = 15;
const C = 7;
// offsets [dx, dy UP] -> board cell (y top-down)
const cell = ([dx, dy]) => ({ x: C + dx, y: C - dy });
const SYMS = [
  ([x, y]) => [x, y], ([x, y]) => [-y, x], ([x, y]) => [-x, -y], ([x, y]) => [y, -x],
  ([x, y]) => [-x, y], ([x, y]) => [x, -y], ([x, y]) => [y, x], ([x, y]) => [-y, -x],
];

test('there are 26 openings: 13 indirect + 13 direct, all distinct', () => {
  expect(OPENINGS).toHaveLength(26);
  expect(OPENINGS.filter((o) => o.group === 'indirect')).toHaveLength(13);
  expect(OPENINGS.filter((o) => o.group === 'direct')).toHaveLength(13);
  expect(new Set(OPENINGS.map((o) => o.group + o.w + o.b)).size).toBe(26);
});

test.each(OPENINGS.map((o) => [o.group + ' ' + o.no + ' ' + o.name, o]))('%s is recognised under all 8 symmetries', (_, o) => {
  for (const s of SYMS) {
    const moves = [{ x: C, y: C }, cell(s(o.w)), cell(s(o.b))];
    expect(detectOpening(moves, SIZE)).toEqual({ group: o.group, no: o.no, name: o.name });
  }
});

describe('free-open (null)', () => {
  const centre = { x: C, y: C };
  test('fewer than three moves', () => {
    expect(detectOpening([centre, cell([1, 1])], SIZE)).toBeNull();
    expect(detectOpening(undefined, SIZE)).toBeNull();
  });
  test('Black 1 off centre', () => {
    expect(detectOpening([{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 4 }], SIZE)).toBeNull();
  });
  test('White 2 outside the 3x3', () => {
    expect(detectOpening([centre, cell([2, 0]), cell([1, 1])], SIZE)).toBeNull();
  });
  test('Black 3 outside the 5x5', () => {
    expect(detectOpening([centre, cell([1, 1]), cell([3, 0])], SIZE)).toBeNull();
  });
  test('Black 3 on an occupied cell', () => {
    expect(detectOpening([centre, cell([1, 1]), cell([1, 1])], SIZE)).toBeNull();
    expect(detectOpening([centre, cell([1, 1]), centre], SIZE)).toBeNull();
  });
  test('only the first three moves matter', () => {
    const o = OPENINGS[0];
    const moves = [centre, cell(o.w), cell(o.b), { x: 0, y: 0 }, { x: 1, y: 0 }];
    expect(detectOpening(moves, SIZE).name).toBe('Chosei');
  });
});
