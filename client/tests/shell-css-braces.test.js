/**
 * B306 regression — shell.css had `.hp-about { order: 7;` with no closing brace, so the next rule
 * (the 44px lobby touch targets) was nested inside `.hp-about` and never matched.
 * jsdom does not evaluate media queries, so check the rule structure instead:
 * balanced braces, and no style rule contains another rule (only @media/@supports may nest).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');

function nestedStyleRules(css) {
  const stack = [];
  const bad = [];
  let prelude = '';
  for (const ch of css) {
    if (ch === '{') {
      const sel = prelude.trim();
      const parent = stack[stack.length - 1];
      if (parent && !parent.startsWith('@')) bad.push(`${sel.slice(0, 70)} inside ${parent.slice(0, 50)}`);
      stack.push(sel);
      prelude = '';
    } else if (ch === '}') {
      if (!stack.length) return { bad: ['unmatched }'], depth: -1 };
      stack.pop();
      prelude = '';
    } else if (ch === ';') {
      prelude = '';
    } else prelude += ch;
  }
  return { bad, depth: stack.length };
}

describe('shell.css rule structure (B306)', () => {
  const css = strip(fs.readFileSync(path.join(__dirname, '..', 'css', 'shell.css'), 'utf8'));
  const res = nestedStyleRules(css);

  it('has balanced braces', () => expect(res.depth).toBe(0));
  it('never nests a style rule inside another style rule', () => expect(res.bad).toEqual([]));
  it('keeps the 44px lobby chip rule directly inside the 860px @media', () => {
    const m = css.match(/@media \(max-width: 860px\) \{\s*body\.zen-lobby \.hstack[\s\S]*?\n\}\n/);
    expect(m).not.toBeNull();
    expect(m[0]).toMatch(/\.hp-qm \.pchip[^{]*\{ min-height: 44px; \}/);
    expect(m[0]).toMatch(/\.hp-about \{ order: 7; \}/);
  });
});
