/**
 * Phone Home "Đang diễn ra" (#419) mini board: stones drew too big and off the line crossing.
 * The real-window cells reused the decorative --b/--w gradients ("circle at 40% 35%", farthest-corner),
 * whose radius on a square cell is ~0.44 cell, centred up-left and clipped square by the cell box.
 * Each stone is now the cell span itself: a centred square circle smaller than the cell.
 * CSS layout itself is not measurable in jsdom; the real-browser numbers are in the fix-log.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'home-hero.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const body = (sel) => {
  const i = css.indexOf(sel + ' {');
  return i < 0 ? null : css.slice(i, css.indexOf('}', i));
};

describe('home live thumbnail stones (#419 mini board)', () => {
  it.each(['.is-b', '.is-w'])('%s does not reuse the off-centre decorative gradient', (cls) => {
    const b = body('.hh-mini--real > ' + cls);
    expect(b).not.toBeNull();
    expect(b).not.toMatch(/var\(--[bw]\)/);
  });

  it('a stone is a centred circle smaller than its cell, sized by width + aspect-ratio (not % margins)', () => {
    const b = body('.hh-mini--real > :is(.is-b, .is-w)');
    expect(b).not.toBeNull();
    expect(b).toMatch(/aspect-ratio:\s*1/);
    expect(b).toMatch(/place-self:\s*center/);
    expect(b).toMatch(/border-radius:\s*50%/);
    expect(b).not.toMatch(/margin/);
    const w = Number((b.match(/width:\s*(\d+)%/) || [])[1]);
    expect(w).toBeGreaterThanOrEqual(60);
    expect(w).toBeLessThanOrEqual(85);
  });
});
