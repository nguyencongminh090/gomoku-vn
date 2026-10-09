/**
 * TODO.md #180 — every skin × mode keeps text/fill pairs AA-legible, and no
 * skin touches the shared board tokens (board stays identical everywhere).
 * Resolves tokens.css the way the cascade does for <html data-skin data-mode>.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'tokens.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const blocks = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, sel, body]) => ({
  sel: sel.trim(),
  vars: Object.fromEntries([...body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()])),
}));

function matches(sel, skin, mode) {
  if (sel === ':root') return true;
  const m = /^:root((?:\[data-(?:skin|mode)="[a-z]+"\])+)$/.exec(sel);
  if (!m) return false;
  return [...m[1].matchAll(/\[data-(skin|mode)="([a-z]+)"\]/g)]
    .every(([, k, v]) => (k === 'skin' ? v === skin : v === mode));
}

// Cascade order = specificity then source order.
function specificity(sel) { return (sel.match(/\[/g) || []).length; }

function resolve(skin, mode) {
  const applicable = blocks
    .map((b, i) => ({ ...b, i }))
    .filter((b) => matches(b.sel, skin, mode))
    .sort((a, b) => specificity(a.sel) - specificity(b.sel) || a.i - b.i);
  return Object.assign({}, ...applicable.map((b) => b.vars));
}

function rgb(hex) {
  const h = hex.replace('#', '');
  const f = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16) / 255);
}
function lum(hex) {
  const [r, g, b] = rgb(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const SKINS = ['arena', 'zen', 'bento'];
const MODES = ['dark', 'light'];

// [foreground, background, min ratio]
const PAIRS = [
  ['--c-ink', '--c-bg', 4.5], ['--c-ink', '--c-surface', 4.5], ['--c-ink', '--c-surface-2', 4.5],
  ['--c-ink-2', '--c-surface', 4.5], ['--c-ink-2', '--c-bg', 4.5],
  ['--c-ink-3', '--c-surface', 4.5], ['--c-ink-3', '--c-bg', 4.5],
  ['--c-on-brand', '--c-brand', 4.5], ['--c-brand-text', '--c-surface', 4.5], ['--c-brand-text', '--c-bg', 4.5],
  ['--c-accent', '--c-surface', 4.5],
  ['--c-error', '--c-surface', 4.5], ['--c-success', '--c-surface', 4.5], ['--c-warning', '--c-surface', 4.5],
  ['--c-state-playing', '--c-surface', 3], ['--c-state-waiting', '--c-surface', 3], ['--c-state-idle', '--c-surface', 3],
  ['--c-ink', '--c-field', 4.5],
];

describe.each(SKINS.flatMap((s) => MODES.map((m) => [s, m])))('%s / %s', (skin, mode) => {
  const t = resolve(skin, mode);

  it.each(PAIRS)('%s on %s ≥ %s:1', (fg, bg, min) => {
    expect(t[fg]).toBeDefined();
    expect(t[bg]).toBeDefined();
    expect(ratio(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
  });

  it('its own block defines the full token set (no leak from another skin)', () => {
    if (skin === 'arena') return;
    const own = blocks.find((b) => b.sel === (mode === 'dark' ? `:root[data-skin="${skin}"]` : `:root[data-skin="${skin}"][data-mode="light"]`));
    const baseKeys = Object.keys(blocks[0].vars).filter((k) => k !== 'color-scheme');
    expect(Object.keys(own.vars)).toEqual(expect.arrayContaining(baseKeys));
  });
});

it('no skin block redefines the shared board tokens', () => {
  expect(blocks.flatMap((b) => Object.keys(b.vars)).filter((k) => /board|stone/.test(k))).toEqual([]);
});
