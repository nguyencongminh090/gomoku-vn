'use strict';

const A = require('../managers/Achievements');

describe('streaks (newest first; loss and draw end a run)', () => {
  test.each([
    [[], 0, 0],
    [['loss'], 0, 0],
    [['win'], 1, 1],
    [['win', 'win', 'loss', 'win', 'win', 'win'], 2, 3],
    [['draw', 'win', 'win'], 0, 2],
    [['win', 'win', 'win'], 3, 3],
    [['loss', 'win', 'win', 'win', 'win'], 0, 4],
  ])('%j → current %i, best %i', (results, current, best) => {
    expect(A.streaks(results)).toEqual({ current, best });
  });
});

describe('badges', () => {
  const ids = (s, showHistory = true) => A.badges(s, { showHistory });

  test.each([
    [{ rankedWins: 0, bestRank: null }, []],
    [{ rankedWins: 1, bestRank: null }, ['first_win']],
    [{ rankedWins: 99, bestRank: null }, ['first_win']],
    [{ rankedWins: 100, bestRank: null }, ['first_win', 'wins_100']],
    [{ rankedWins: 1000, bestRank: null }, ['first_win', 'wins_100', 'wins_1000']],
    [{ rankedWins: 0, bestRank: 501 }, []],
    [{ rankedWins: 0, bestRank: 500 }, ['top_500']],
    [{ rankedWins: 0, bestRank: 11 }, ['top_500']],
    [{ rankedWins: 0, bestRank: 10 }, ['top_500', 'top_10']],
    [{ rankedWins: 0, bestRank: 1 }, ['top_500', 'top_10']],
  ])('%j → %j', (stats, expected) => {
    expect(ids(stats)).toEqual(expected);
  });

  test('hidden history withholds win-count badges but keeps public rank badges', () => {
    expect(ids({ rankedWins: 1000, bestRank: 7 }, false)).toEqual(['top_500', 'top_10']);
  });
});
