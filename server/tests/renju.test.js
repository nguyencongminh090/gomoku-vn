'use strict';
// #425 — Black's forbidden moves (RIF s.9). Pure module shared with the client.
const Renju = require('../../client/js/renju');

const N = 15;
/** Board from stone lists: B/W = [[x, y], ...], X = walls. */
function board({ B = [], W = [], X = [] }) {
  const b = Array.from({ length: N }, () => Array(N).fill(0));
  for (const [x, y] of B) b[y][x] = 1;
  for (const [x, y] of W) b[y][x] = 2;
  for (const [x, y] of X) b[y][x] = -1;
  return b;
}
const reason = (spec, x, y) => Renju.forbiddenReason(board(spec), x, y);

describe('forbiddenReason', () => {
  test('empty board and a lone line are fine', () => {
    expect(reason({}, 7, 7)).toBeNull();
    expect(reason({ B: [[5, 7], [6, 7]] }, 7, 7)).toBeNull(); // a single three
  });

  test('double three', () => {
    expect(reason({ B: [[5, 7], [6, 7], [7, 5], [7, 6]] }, 7, 7)).toBe('double_three');
  });

  test('a closed three (white on one end) does not count', () => {
    expect(reason({ B: [[5, 7], [6, 7], [7, 5], [7, 6]], W: [[4, 7]] }, 7, 7)).toBeNull();
  });

  test('a wall counts as a blocker like the edge', () => {
    expect(reason({ B: [[5, 7], [6, 7], [7, 5], [7, 6]], X: [[4, 7]] }, 7, 7)).toBeNull();
  });

  test('double four, two fours on different lines', () => {
    expect(reason({ B: [[4, 7], [5, 7], [6, 7], [7, 4], [7, 5], [7, 6]] }, 7, 7)).toBe('double_four');
  });

  test('double four on ONE line (x.xxx.x)', () => {
    expect(reason({ B: [[4, 7], [6, 7], [8, 7], [10, 7]] }, 7, 7)).toBe('double_four');
  });

  test('a straight four is ONE four, not forbidden', () => {
    expect(reason({ B: [[5, 7], [6, 7], [8, 7]] }, 7, 7)).toBeNull();
  });

  test('overline (6+) is forbidden', () => {
    expect(reason({ B: [[4, 7], [5, 7], [6, 7], [8, 7], [9, 7]] }, 7, 7)).toBe('overline');
  });

  test('exactly five wins even if the same stone also makes an overline elsewhere', () => {
    const spec = { B: [[3, 7], [4, 7], [5, 7], [6, 7], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]] };
    expect(reason(spec, 7, 7)).toBeNull();
    expect(Renju.exactFive(board(spec), 7, 7)).toBe(true);
  });

  test('a Black move onto an occupied cell has no reason', () => {
    expect(reason({ B: [[7, 7]] }, 7, 7)).toBeNull();
  });

  describe('RIF 9.3 recursion — a three whose only straight-four point is itself forbidden does not count', () => {
    // Column three (7,1)(7,2)+P(7,3) near the top edge: its only straight-four point is (7,4).
    const rowThree = [[5, 3], [6, 3]];
    const column = [[7, 1], [7, 2]];
    test('control: two open threes -> double three', () => {
      expect(reason({ B: [...rowThree, ...column] }, 7, 3)).toBe('double_three');
    });
    test('(7,4) is a double four for Black, so the column is not a three -> P is legal', () => {
      const spec = { B: [...rowThree, ...column, [4, 4], [5, 4], [6, 4]] };
      expect(reason(spec, 7, 3)).toBeNull();
    });
  });
});

describe('forbiddenPoints', () => {
  test('lists every forbidden empty cell with its reason', () => {
    const pts = Renju.forbiddenPoints(board({ B: [[5, 7], [6, 7], [7, 5], [7, 6]] }));
    expect(pts).toContainEqual({ x: 7, y: 7, reason: 'double_three' });
    expect(pts.every((p) => p.reason)).toBe(true);
  });
  test('empty board has none', () => {
    expect(Renju.forbiddenPoints(board({}))).toEqual([]);
  });
  test('does not mutate the board', () => {
    const b = board({ B: [[5, 7], [6, 7], [7, 5], [7, 6]] });
    const copy = JSON.stringify(b);
    Renju.forbiddenPoints(b);
    expect(JSON.stringify(b)).toBe(copy);
  });
});

describe('work cap', () => {
  test('a dense crafted board is answered quickly and deterministically', () => {
    // Black stones on a lattice that makes many threes available at every probe.
    const stones = [];
    for (let y = 1; y < 14; y++) for (let x = 1; x < 14; x++) if ((x + 2 * y) % 3 !== 0) stones.push([x, y]);
    const b = board({ B: stones });
    const t0 = Date.now();
    const a = Renju.forbiddenPoints(b);
    const again = Renju.forbiddenPoints(board({ B: stones }));
    expect(Date.now() - t0).toBeLessThan(2000);
    expect(again).toEqual(a);
  });

  test('over budget fails closed and leaves the board untouched', () => {
    const stones = [];
    for (let y = 1; y < 14; y++) for (let x = 1; x < 14; x++) if ((x + 2 * y) % 3 !== 0) stones.push([x, y]);
    const b = board({ B: stones });
    const copy = JSON.stringify(b);
    const pts = Renju.forbiddenPoints(b);
    expect(JSON.stringify(b)).toBe(copy);
    expect(pts.every((p) => ['overline', 'double_four', 'double_three'].includes(p.reason))).toBe(true);
  });
});
