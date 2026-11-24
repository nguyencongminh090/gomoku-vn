/** B375 — no vi i18n string may be double-encoded UTF-8 (e.g. "nhÃ³m" for "nhóm"). */
'use strict';
const fs = require('fs');
const path = require('path');

test('i18n.js contains no mojibake (Ã/Â followed by a C1/Latin-1 continuation char)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../js/i18n.js'), 'utf8');
  const bad = src.split('\n').filter((l) => /[ÃÂ][\u0080-¿]/.test(l));
  expect(bad).toEqual([]);
});

// B445 — static fallback text in the HTML pages must be clean too.
test('client/*.html contain no mojibake', () => {
  const dir = path.join(__dirname, '..');
  const bad = [];
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.html'))) {
    fs.readFileSync(path.join(dir, f), 'utf8').split('\n').forEach((l, i) => {
      if (/[ÃÂ][\u0080-¿]/.test(l)) bad.push(`${f}:${i + 1}`);
    });
  }
  expect(bad).toEqual([]);
});
