/** B375 — no vi i18n string may be double-encoded UTF-8 (e.g. "nhÃ³m" for "nhóm"). */
'use strict';
const fs = require('fs');
const path = require('path');

test('i18n.js contains no mojibake (Ã/Â followed by a C1/Latin-1 continuation char)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../js/i18n.js'), 'utf8');
  const bad = src.split('\n').filter((l) => /[ÃÂ][\u0080-¿]/.test(l));
  expect(bad).toEqual([]);
});
