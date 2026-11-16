/** B375 — server-side vi strings must not be double-encoded UTF-8 (e.g. "nhÃ³m"). */
'use strict';
const fs = require('fs');
const path = require('path');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'tests' || e.name === 'node_modules' ? [] : walk(p);
    return e.name.endsWith('.js') ? [p] : [];
  });
}

test('server sources contain no mojibake', () => {
  const bad = [];
  for (const f of walk(path.join(__dirname, '..'))) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
      if (/[ÃÂ][\u0080-¿]/.test(l)) bad.push(`${path.relative(path.join(__dirname, '..'), f)}:${i + 1}`);
    });
  }
  expect(bad).toEqual([]);
});
