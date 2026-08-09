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

describe('toTelex', () => {
  test('encodes accented Vietnamese into Telex spelling', () => {
    expect(pf.toTelex('lồn')).toBe('loofn');
    expect(pf.toTelex('địt mẹ')).toBe('ddijt mej');
  });

  test('leaves plain ASCII unchanged', () => {
    expect(pf.toTelex('hello')).toBe('hello');
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

  test('masks "con mẹ" — kept as a product decision despite a neutral reading', () => {
    // Reviewed alongside "bỏ mẹ"/"thấy mẹ" (removed) and "má" (removed) —
    // "con mẹ" leans tục enough in practice to stay, unlike those.
    expect(pf.filterMessage('con mẹ này')).toBe('****** này');
  });

  test('masks un-decoded Telex typing (IME off) of a bad word', () => {
    // "loofn" is literally what lands in the chat box if a user types the
    // Telex sequence for "lồn" without their Vietnamese IME switched on.
    expect(pf.filterMessage('loofn')).toBe('*****');
    expect(pf.filterMessage('ddijt mej')).toBe('*********');
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
    // Surfaced after lowering MIN_TOKEN_LENGTH_FOR_FUZZY/MIN_SKELETON_LENGTH_FOR_FUZZY
    // to 4 (see tools/profanity-training/) — "well" sits at edit distance 1
    // from the vendored "dell" entry; the classifier reject-stage is what
    // keeps it (and the Vietnamese loanword collisions) from being masked.
    // NOTE: "consol"/"contac"/"culong"-style borderline cases (score close
    // to 0) are deliberately left out of this list — confirmed flaky across
    // two separate retrains (a dictionary change shifts the char-n-gram
    // vocabulary enough to flip these). That's an expected property of a
    // statistical model on a modest dataset, not a regression to chase by
    // pinning individual borderline predictions in tests. Fix at the
    // dataset/model level instead (tools/profanity-training/).
    // "má" ("mom"/"cheek") and the "vãi" casual intensifier ("vui vãi",
    // "đẹp vãi") were removed from VI_BADWORDS as standalone entries — they
    // were common, benign words, not obfuscation of anything. The genuinely
    // vulgar phrases they originated from ("đù má", "vãi lồn") are separate
    // array entries and still get caught (see the exact-match tests above).
    'má tôi bảo vậy',
    'gọi má đi con',
    'vui vãi',
    'đẹp vãi',
    'mệt vãi luôn',
    'vãi cả nồi',
    // "cái lon"/"cai lon" ("a can") and "cái lờ" ("a bamboo fish trap") were
    // removed from VI_BADWORDS — "cái" + noun is the single most common
    // Vietnamese noun-classifier construction, so this was the highest-risk
    // euphemism entry in the whole "X lon" family. Other "X lon" phrases
    // (con lon, ăn lon, etc.) are unaffected and still get caught above.
    'cái lon nước',
    'cho tôi cái lon nước ngọt',
    // "sấp mặt" ("ngã sấp mặt", "làm sấp mặt" — an ordinary idiom for
    // exhaustion/falling flat, not inherently vulgar) and the "bỏ mẹ"/"thấy
    // mẹ" casual intensifiers ("mệt bỏ mẹ", "mệt thấy mẹ" ~ "damn tired",
    // same family as "vãi") were removed — product decision. "con mẹ" was
    // reviewed alongside these and kept (see the exact-match test below).
    'sấp mặt',
    'làm việc sấp mặt luôn',
    'mệt bỏ mẹ',
    'mệt thấy mẹ',
  ])('leaves %j unchanged', (text) => {
    expect(pf.filterMessage(text)).toBe(text);
  });

  // Product decision: "lờ" stays in the dictionary despite being ambiguous
  // (vulgar slang for female genitalia vs. the ordinary verb "to ignore" —
  // "lờ đi", "đừng lờ tôi"). Unlike "cái lon"/"má", this one doesn't lean
  // overwhelmingly benign, so "đừng lờ tôi" is accepted as over-blocked.
  test('accepts "lờ" standalone being over-blocked as a deliberate trade-off', () => {
    expect(pf.filterMessage('đừng lờ tôi')).not.toBe('đừng lờ tôi');
  });
});

describe('filterMessage — fuzzy/classifier stages disabled (exact-match only)', () => {
  test('a near-miss typo one edit away from a dictionary word is no longer masked', () => {
    // "shiy" is edit-distance 1 from "shit" — previously eligible for a
    // fuzzy match (classifierSaysReal was the only thing that could reject
    // it). Both the fuzzy scoring and the classifier reject-stage are now
    // off, so this never becomes a candidate match at all.
    expect(pf.filterMessage('shiy happens')).toBe('shiy happens');
  });

  test('a near-miss typo of a Vietnamese word one edit away is no longer masked', () => {
    // "lônn" collapses to "lôn" via the tight/repeat-collapse form, which is
    // still edit-distance 1 from the tone-aware dictionary entry "lồn" (tone
    // differs) — exercises the tone-aware fuzzy path being off too.
    expect(pf.filterMessage('lônn quá')).toBe('lônn quá');
  });

  test('repeat-collapse normalization ("duplicate") still exact-matches the dictionary', () => {
    // "shiit" has no direct dictionary entry, but its repeat-collapsed
    // ("tight") form "shit" does — this is the normalize+dictionary path
    // that stays on.
    expect(pf.filterMessage('shiit happens')).toBe('***** happens');
  });

  test('an exact dictionary word is still masked with fuzzy/classifier off', () => {
    expect(pf.filterMessage('fuck this')).toBe('**** this');
  });
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
