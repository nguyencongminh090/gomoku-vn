/** @jest-environment node */
// Card rule (ticket-rows.md): card surfaces take padding/radius/gap from --card-* tokens, not literals.
const fs = require('fs');
const path = require('path');
const css = (f) => fs.readFileSync(path.join(__dirname, '../css', f), 'utf8');

const CARDS = [
  ['lobby.css', '.tournament-card'], ['lobby-zen.css', 'body.zen-lobby .tournament-card'], ['tournament.css', '.pairing-card'],
  ['tournament.css', '.match-result-card'], ['puzzles.css', '.pz-card'], ['forum.css', '.fm-post'],
  ['platform.css', '.pcard'], ['platform.css', '.prows--tickets .prow'], ['shell.css', 'body.zen-lobby .hrow'],
];

function body(file, sel) {
  const s = css(file).replace(/\/\*[\s\S]*?\*\//g, '');
  const i = s.indexOf('\n' + sel + ' {') >= 0 ? s.indexOf('\n' + sel + ' {') : s.indexOf(sel + ' {');
  expect(i).toBeGreaterThanOrEqual(0);
  return s.slice(s.indexOf('{', i) + 1, s.indexOf('}', i));
}

describe('card tokens', () => {
  test('tokens defined', () => {
    const m = css('main.css');
    for (const t of ['--card-pad:', '--card-pad-lg:', '--card-radius:', '--card-gap:']) expect(m).toContain(t);
  });
  test.each(CARDS)('%s %s uses --card-* for padding and radius', (f, sel) => {
    const b = body(f, sel);
    expect(b).toMatch(/padding:\s*(var\(--card-pad(-lg)?\)|var\(--space-\d\)[^;]*)/);
    expect(b).toMatch(/border-radius:\s*var\(--(card-radius|radius-xl)\)/);
  });
});
