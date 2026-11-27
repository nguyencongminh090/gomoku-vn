/**
 * #499 — move-list coordinates must use the same column letters as board.js
 * (A… including "I"), so the list and the board name every stone identically.
 */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '../js/move-tree.js'), 'utf8');
// move-tree.js is a classic script with top-level declarations; evaluate it in a function scope.
const { coordToLabel } = new Function(`${src}\n;return { coordToLabel };`)();

describe('move-tree coordToLabel (#499)', () => {
  test('column 8 is "I" (not skipped)', () => {
    expect(coordToLabel(8, 0, 15)).toBe('I15');
  });

  test('column 14 is "O", matching board.js', () => {
    expect(coordToLabel(14, 6, 15)).toBe('O9');
  });

  test('last column of a 20×20 board is "T", not "?"', () => {
    expect(coordToLabel(19, 19, 20)).toBe('T1');
  });
});
