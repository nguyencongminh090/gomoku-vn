'use strict';

/**
 * profanity-filter.test.js — Unit tests for client/js/profanity-filter.js.
 *
 * The module lives under client/js/ (it's shared with the browser via a
 * side-effect ES-module import) but is a plain UMD/CommonJS-compatible file,
 * so it can be `require()`d directly from a Node test.
 */

const pf = require('../../client/js/profanity-filter');

describe('normalizeToken', () => {
  test('strips diacritics and lowercases', () => {
    expect(pf.normalizeToken('ĐỊT').basic).toBe('dit');
    expect(pf.normalizeToken('lồn').basic).toBe('lon');
  });

  test('collapses repeated characters only in the tight form', () => {
    const n = pf.normalizeToken('loooz');
    expect(n.basic).toBe('loooz');
    expect(n.tight).toBe('loz');
  });

  test('flags tokens typed with Vietnamese diacritics', () => {
    expect(pf.normalizeToken('buổi').hasDiacritics).toBe(true);
    expect(pf.normalizeToken('buoi').hasDiacritics).toBe(false);
    expect(pf.normalizeToken('đi').hasDiacritics).toBe(true);
  });
});

describe('tokenize', () => {
  test('keeps original-text offsets', () => {
    const tokens = pf.tokenize('hello  world');
    expect(tokens).toHaveLength(2);
    expect(tokens[0]).toMatchObject({ raw: 'hello', start: 0, end: 5 });
    expect(tokens[1]).toMatchObject({ raw: 'world', start: 7, end: 12 });
  });
});

describe('levenshteinBounded', () => {
  test('computes exact distance within bound', () => {
    expect(pf.levenshteinBounded('kitten', 'sitting', 5)).toBe(3);
  });

  test('returns Infinity once the cutoff is exceeded', () => {
    expect(pf.levenshteinBounded('abcdef', 'ghijkl', 1)).toBe(Infinity);
  });

  test('detects transpositions as distance 1', () => {
    expect(pf.levenshteinBounded('ab', 'ba', 2)).toBe(1);
  });
});

describe('decomposeUnits', () => {
  test('splits tone marks from vowel-identity marks', () => {
    // "ố" = ô (circumflex, vowel identity) + sắc (tone) — both should
    // survive, but as separate axes.
    const units = pf.decomposeUnits('ố');
    expect(units).toEqual([{ sym: 'ô', tone: 2 }]);
  });

  test('folds đ to d with no tone', () => {
    expect(pf.decomposeUnits('đi')).toEqual([
      { sym: 'd', tone: 0 },
      { sym: 'i', tone: 0 },
    ]);
  });
});

describe('toneAwareDistanceBounded', () => {
  test('a tone-only difference costs more than an ordinary substitution', () => {
    const buoi3 = pf.decomposeUnits('buổi'); // hỏi tone
    const buoi1 = pf.decomposeUnits('buồi'); // huyền tone — same skeleton
    const dist = pf.toneAwareDistanceBounded(buoi3, buoi1, 5);
    expect(dist).toBeGreaterThan(1);
  });

  test('a vowel-identity difference within the same family also costs more', () => {
    // "chăn" (ă) vs "chân" (â) — same base-letter family, same "ch_n" frame.
    const chan1 = pf.decomposeUnits('chăn');
    const chan2 = pf.decomposeUnits('chân');
    const dist = pf.toneAwareDistanceBounded(chan1, chan2, 5);
    expect(dist).toBeGreaterThan(1);
  });

  test('a full vowel swap across different families still costs 1 (relies on the length floor, not this penalty)', () => {
    // "lắng" (a-family) vs "lồng" (o-family) — genuinely different vowel,
    // not an accent-mark variant of the same letter.
    const lang = pf.decomposeUnits('lắng');
    const long = pf.decomposeUnits('lồng');
    expect(pf.toneAwareDistanceBounded(lang, long, 5)).toBe(1);
  });

  test('an ordinary single-letter insertion still costs 1', () => {
    const ban = pf.decomposeUnits('bàn');
    const bang = pf.decomposeUnits('bàng');
    expect(pf.toneAwareDistanceBounded(ban, bang, 2)).toBe(1);
  });
});

describe('maskMessage', () => {
  test('replaces spans with asterisks, preserving length and surrounding text', () => {
    const text = 'you are a shit person';
    const masked = pf.maskMessage(text, [[10, 14]]);
    expect(masked).toBe('you are a **** person');
    expect(masked.length).toBe(text.length);
  });

  test('is a no-op with no spans', () => {
    expect(pf.maskMessage('clean text', [])).toBe('clean text');
  });
});

describe('filterMessage — exact and obfuscated matches', () => {
  test('masks an exact English bad word', () => {
    expect(pf.filterMessage('shit happens')).toBe('**** happens');
  });

  test('masks an exact Vietnamese bad word', () => {
    expect(pf.filterMessage('lồn')).toBe('***');
  });

  test('masks a punctuation-spacing evasion ("d.m")', () => {
    expect(pf.filterMessage('d.m mày làm gì vậy')).toBe('*** mày làm gì vậy');
  });

  test('masks a leetspeak/repeat obfuscation ("sh1t")', () => {
    expect(pf.filterMessage('sh1t happens')).toBe('**** happens');
  });

  test('masks a diacritic-stripped Vietnamese variant', () => {
    expect(pf.filterMessage('dit me may')).toBe('**********');
  });

  test('masks a Vietnamese multi-word slur phrase', () => {
    expect(pf.filterMessage('vãi cả lồn')).toBe('**********');
  });
});

describe('filterMessage — false-positive resistance', () => {
  test.each([
    'cuối tuần này đi chơi không',
    'buổi sáng tốt lành',
    'chào buổi sáng',
    'đi ăn cơm',
    'con cua ngon quá',
    'các bạn ơi vào chơi đi',
    'con đường này dài quá',
    'ăn phở không',
    'con lợn này to quá',
    'đi bơi không mọi người',
    'không có gì đâu, đừng lo lắng',
    'trận đấu hôm nay hay quá, mong chờ ván tiếp theo',
    'shitting around all day long',
    'you sang really well tonight',
    'cut the tree please',
    'this is a clean message about chess',
    'không có gì đâu, đừng lo lắng quá',
    'yên lặng nào',
    'lẳng lơ quá',
    'lóng ngóng thế',
    'lộng lẫy quá',
    'buổi họp hôm nay',
  ])('leaves %j unchanged', (text) => {
    expect(pf.filterMessage(text)).toBe(text);
  });

  // Known limitation: a few multi-word phrases are vendored verbatim in the
  // source dictionary as slang euphemisms but are also completely ordinary
  // Vietnamese ("cái lon" = "the can", also a euphemism for "lồn"). This is
  // an exact dictionary-content collision, not a distance-scoring issue, and
  // isn't fixed by the tone-aware model above.
  test.todo('cái lon nước (can of soda) is currently over-blocked — dictionary-content issue, not fuzzy-matching');
});

describe('filterMessage — edge cases', () => {
  test('passes through a clean message unchanged', () => {
    const text = 'chess is a great game, want to play?';
    expect(pf.filterMessage(text)).toBe(text);
  });

  test('handles empty and non-string input safely', () => {
    expect(pf.filterMessage('')).toBe('');
    expect(pf.filterMessage(null)).toBe(null);
    expect(pf.filterMessage(undefined)).toBe(undefined);
  });
});
