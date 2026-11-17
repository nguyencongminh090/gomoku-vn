/** ui-audit R1: room.html uses .btn-primary; it must be defined in a stylesheet room.html loads (it once lived only in login.css). */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'room.html'), 'utf8');
const sheets = [...html.matchAll(/<link rel="stylesheet" href="(css\/[^"?]+)/g)].map((m) => m[1]);

test('room.html uses .btn-primary', () => { expect(html).toMatch(/class="btn-primary"/); });
test('a stylesheet loaded by room.html defines .btn-primary', () => {
  const css = sheets.map((f) => fs.readFileSync(path.join(root, f), 'utf8')).join('\n');
  expect(css).toMatch(/(^|\n)\.btn-primary\s*\{/);
});
