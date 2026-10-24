'use strict';

const t = require('../utils/text-search');

const mk = (id, display, user) => ({ id, fields: [t.prepare(display), t.prepare(user)] });
const DOCS = [
  mk('nva', 'Nguyễn Văn A', 'nva'),
  mk('duc-anh', 'Đức Anh', 'ducanh'),
  mk('duc', 'DUC', 'duc99'),
  mk('binh', 'Trần Thị Bình', 'binh_tt'),
  mk('bao', 'Nguyen Van Bao', 'bao'),
];
const ids = (q) => t.search(q, DOCS).map((h) => h.id);

describe('fold', () => {
  test.each([
    ['Nguyễn  Đức', 'nguyen duc'],
    ['NGUYỄN', 'nguyen'],
    ['Nguyễn'.normalize('NFD'), 'nguyen'],     // NFD input folds like NFC
    ['đ​ức', 'duc'],                        // zero-width char
    ['‮evil', 'evil'],                      // bidi override
    ['ｆｕｌｌ', 'full'],                        // full-width
    [null, ''],
  ])('%j → %j', (a, b) => expect(t.fold(a)).toBe(b));
});

describe('editDistance', () => {
  test.each([
    ['nguyen', 'nguyen', 0], ['nguyen', 'nugyen', 1], ['nguyen', 'nguyn', 1], ['nguyen', 'nguyan', 1], ['abc', 'xyz', 3],
  ])('%s vs %s', (a, b, d) => expect(t.editDistance(a, b, 3)).toBe(d));
  test('stops early over the budget', () => expect(t.editDistance('aaaaaa', 'bbbbbb', 1)).toBe(2));
});

describe('search ranking', () => {
  test('accent- and case-insensitive both ways (the LIKE bug)', () => {
    expect(ids('nguyen')).toEqual(['nva', 'bao']);
    expect(ids('NGUYỄN')).toEqual(['nva', 'bao']);
    expect(ids('đức')[0]).toBe('duc');
  });
  test('exact beats prefix; exact-accent beats accent-less on a tie', () => {
    expect(ids('duc')).toEqual(['duc', 'duc-anh']);
    expect(ids('nguyễn')[0]).toBe('nva');
  });
  test('any word order, each word a prefix', () => {
    expect(ids('van nguyen')).toEqual(expect.arrayContaining(['nva', 'bao']));
    expect(ids('tran bin')).toEqual(['binh']);
  });
  test('mid-word substring', () => expect(ids('guyen')).toEqual(['nva', 'bao']));
  test('matches the login handle, underscore splits words', () => expect(ids('binh tt')).toEqual(['binh']));
  test('typo tolerance only as a fallback', () => {
    expect(ids('nugyen')).toEqual(['nva', 'bao']);   // swap
    expect(ids('tran thi bing')).toEqual(['binh']);  // substitution
    expect(ids('nguyen')).not.toContain('binh');     // no look-alike padding when exact hits exist
  });
  test('short tokens are not fuzzy', () => expect(ids('ha')).toEqual([]));
  test('empty / whitespace / punctuation-only', () => {
    expect(ids('')).toEqual([]);
    expect(ids('   ')).toEqual([]);
    expect(ids('%_')).toEqual([]);       // no wildcard meaning
  });
  test('limit and deterministic tie-break (shorter name first)', () => {
    expect(t.search('nguyen', DOCS, { limit: 1 })).toHaveLength(1);
    expect(ids('nguyen')[0]).toBe('nva');
  });
});

describe('createIndex / searchIndex ≡ brute-force search', () => {
  // Deterministic pseudo-random corpus with accents, shared prefixes, digits, short tokens.
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const W = ['Nguyễn', 'Nguyen', 'Văn', 'Van', 'Đức', 'Duc', 'Trần', 'Bình', 'binh', 'An', 'Anh', 'Lê', 'Hoàng', 'nga', 'ngô', 'x', 'user', '9'];
  const docs = Array.from({ length: 300 }, (_, i) => {
    const name = Array.from({ length: 1 + rnd(3) }, () => W[rnd(W.length)]).join(rnd(4) ? ' ' : '_') + (rnd(2) ? rnd(100) : '');
    return mk('d' + i, name, 'u' + i + W[rnd(W.length)].toLowerCase());
  });
  const index = t.createIndex(docs);
  const QUERIES = ['nguyen', 'NGUYỄN văn', 'van nguyen', 'duc', 'đức', 'guyen', 'ngu', 'nugyen', 'binhh', 'tran bing', 'an', 'ab', 'u12', 'zzzz', 'x 9', '_', '%', 'nguyen_van', '  ', '%', 'hoang le', 'ngo', 'vna'];
  test.each(QUERIES)('%j', (q) => {
    expect(t.searchIndex(q, index)).toEqual(t.search(q, docs));
  });
  test('limit', () => expect(t.searchIndex('nguyen', index, { limit: 3 })).toEqual(t.search('nguyen', docs, { limit: 3 })));
});
