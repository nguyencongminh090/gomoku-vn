'use strict';
// #377: the lobby `moves` delta — the cut (server) and the splice (client) share client/js/lobby-moves.js.
const { sharedPrefix, applyDelta } = require('../../client/js/lobby-moves');

describe('sharedPrefix', () => {
  test.each([
    ['no game before', null, [1, 2], 0],
    ['no game now', [1, 2], null, 0],
    ['empty before', [], [1, 2], 0],
    ['moves appended', [1, 2, 3, 4], [1, 2, 3, 4, 5, 6], 4],
    ['unchanged', [1, 2], [1, 2], 2],
    ['undo shrank it', [1, 2, 3, 4, 5, 6], [1, 2, 3, 4], 4],
    ['undo then a different move', [1, 2, 3, 4], [1, 2, 9, 9], 2],
    ['x matches, y differs: rounds down to a whole move', [1, 2, 3, 4], [1, 2, 3, 9], 2],
    ['first move differs', [1, 2], [3, 4], 0],
  ])('%s', (_, prev, next, want) => expect(sharedPrefix(prev, next)).toBe(want));
});

describe('applyDelta', () => {
  const held = { roomId: 'A', startedAt: 100, moves: [1, 2, 3, 4] };
  test('an entry without movesFrom is returned as is (full entry)', () => {
    const e = { roomId: 'A', moves: [5, 5] };
    expect(applyDelta(held, e)).toBe(e);
  });
  test('appends at movesFrom and drops the movesFrom field', () => {
    expect(applyDelta(held, { roomId: 'A', startedAt: 100, movesFrom: 4, moves: [5, 6] }))
      .toEqual({ roomId: 'A', startedAt: 100, moves: [1, 2, 3, 4, 5, 6] });
  });
  test('splices by index: a held snapshot newer than the diff baseline is not doubled', () => {
    const newer = { ...held, moves: [1, 2, 3, 4, 5, 6] };
    expect(applyDelta(newer, { roomId: 'A', startedAt: 100, movesFrom: 4, moves: [5, 6, 7, 8] }).moves)
      .toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
  test('a board-only upsert takes every other field from the held entry', () => {
    const full = { ...held, roomName: 'R', userCount: 3 };
    expect(applyDelta(full, { roomId: 'A', startedAt: 100, movesFrom: 4, moves: [5, 6] }))
      .toEqual({ ...full, moves: [1, 2, 3, 4, 5, 6] });
  });
  test('undo: a shorter tail truncates', () => {
    expect(applyDelta(held, { roomId: 'A', startedAt: 100, movesFrom: 2, moves: [] }).moves).toEqual([1, 2]);
  });
  test('idempotent: applying the same delta twice gives the same moves', () => {
    const d = { roomId: 'A', startedAt: 100, movesFrom: 4, moves: [5, 6] };
    const once = applyDelta(held, d);
    expect(applyDelta(once, d)).toEqual(once);
  });
  test.each([
    ['no held entry', undefined],
    ['held entry has no game', { roomId: 'A', startedAt: null, moves: null }],
    ['held entry is another game', { ...held, startedAt: 99 }],
    ['held fewer than movesFrom', { ...held, moves: [1, 2] }],
  ])('needs a snapshot (null): %s', (_, h) => {
    expect(applyDelta(h, { roomId: 'A', startedAt: 100, movesFrom: 4, moves: [5, 6] })).toBeNull();
  });
});
