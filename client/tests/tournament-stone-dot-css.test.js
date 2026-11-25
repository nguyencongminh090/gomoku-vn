/**
 * #469 — team pairing card: the black-colour dot (#1a1a1a) vanished on dark cards, so players could not
 * see who has black. It now carries a 1px ring in --c-ink-3; that ring must reach WCAG 1.4.11 non-text
 * contrast (3:1) against the card surface and page bg in every skin × mode token block.
 * jsdom has no paint, so this pins the rule + token contrast; pixels are checked in the browser.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', 'css', f), 'utf8');
const tcss = read('tournament.css');
const tokens = read('tokens.css');

function rule(css, sel) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp('(^|\\n)' + esc + '\\s*\\{([^}]*)\\}'));
  if (!m) throw new Error('rule not found: ' + sel);
  return m[2];
}
const tokenOf = (block, name) => block.match(new RegExp('--' + name + ':\\s*(#[0-9a-f]{6})', 'i'))[1];
function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe('team pairing black stone dot is visible in every mode (#469)', () => {
  it('the black dot has a ring drawn in --c-ink-3', () => {
    expect(rule(tcss, '.match-stone-dot--black')).toMatch(/border:\s*1px solid var\(--c-ink-3\)/);
  });

  it.each([
    ':root', ':root[data-mode="light"]',
    ':root[data-skin="zen"]', ':root[data-skin="zen"][data-mode="light"]',
    ':root[data-skin="bento"]', ':root[data-skin="bento"][data-mode="light"]',
  ])('%s: ring ≥ 3:1 against surface and bg', (sel) => {
    const block = rule(tokens, sel);
    const ring = tokenOf(block, 'c-ink-3');
    expect(contrast(ring, tokenOf(block, 'c-surface'))).toBeGreaterThanOrEqual(3);
    expect(contrast(ring, tokenOf(block, 'c-bg'))).toBeGreaterThanOrEqual(3);
  });
});
