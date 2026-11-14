/** B375 — rankings.* vi strings must not be double-encoded UTF-8 (e.g. "NhÃ³m"). */
'use strict';
const fs = require('fs');
const path = require('path');

test('rankings.* i18n strings contain no mojibake', () => {
  const src = fs.readFileSync(path.join(__dirname, '../js/i18n.js'), 'utf8');
  const bad = src.split('\n').filter((l) => /'rankings\.[\w.]+':/.test(l) && /[ÃÂ][\u0080-¿]/.test(l));
  expect(bad).toEqual([]);
});
