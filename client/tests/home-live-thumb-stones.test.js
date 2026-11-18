/**
 * Phone Home "Đang diễn ra" (#419) mini board: stones drew too big / off the line crossing.
 * Round 1 (2026-11-18): CSS-grid spans + background-tile lines — still visibly off (each layer rounded on its own).
 * Round 2: one SVG like the room board (geometry asserted in lobby-home.test.js). This file guards the CSS side:
 * the real board must not inherit the decorative 4/3 box (would letterbox / stretch the 9×7 viewBox) and must not
 * keep any CSS-drawn grid or stones.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'home-hero.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const body = (sel) => {
  const i = css.indexOf(sel + ' {');
  return i < 0 ? null : css.slice(i, css.indexOf('}', i));
};

describe('home live thumbnail (#419 mini board) CSS', () => {
  it('the SVG board takes its own viewBox ratio, not the decorative 4/3', () => {
    const b = body('.hh-mini--real');
    expect(b).not.toBeNull();
    expect(b).toMatch(/aspect-ratio:\s*auto/);
    expect(b).toMatch(/height:\s*auto/);
  });

  it('no CSS-drawn grid lines or span stones remain for the real board', () => {
    expect(css).not.toMatch(/\.hh-mini--real\s*>\s*\.is-[bw]/);
    expect(body('.hh-mini--real')).not.toMatch(/repeating-linear-gradient|var\(--cols\)/);
  });

  it('grid and stone strokes stay 1 device-independent px at any size', () => {
    expect(body('.hh-mini__grid')).toMatch(/vector-effect:\s*non-scaling-stroke/);
  });
});
