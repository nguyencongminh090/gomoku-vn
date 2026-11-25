/**
 * #464 — tournament sub-tab labels ("Cặp đấu", "Bảng xếp hạng", "Lịch sử ván đấu") wrapped to two lines
 * at 390 px: flex items shrank and the label text broke. Labels must stay on one line; when the strip is
 * wider than the screen it scrolls inside itself instead of wrapping or widening the page.
 * jsdom has no layout, so this pins the CSS rules; the 390 px pixel check is the browser.cjs team shot.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'tournament.css'), 'utf8');

/** Declarations of the first top-level rule whose selector is exactly `sel`. */
function decls(sel) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp('(^|\\n)' + esc + '\\s*\\{([^}]*)\\}'));
  if (!m) throw new Error('rule not found: ' + sel);
  return Object.fromEntries(m[2].split(';').map((d) => d.split(':').map((x) => x.trim())).filter((d) => d.length === 2 && d[0]));
}

describe('tournament sub-tabs stay on one line (#464)', () => {
  it('buttons do not shrink and their labels do not wrap', () => {
    const btn = decls('.sub-tabs__btn');
    expect(btn['white-space']).toBe('nowrap');
    expect(btn.flex).toBe('none');
  });
  it('an over-wide strip scrolls horizontally inside .sub-tabs', () => {
    const strip = decls('.sub-tabs');
    expect(strip.display).toBe('flex');
    expect(strip['overflow-x']).toBe('auto');
    expect(strip['flex-wrap'] || 'nowrap').toBe('nowrap');
  });
  it('keyboard focus ring is drawn inside the button so the scroll strip does not clip it', () => {
    // main.css sets `:focus-visible { outline-offset: 2px !important }`; only an !important rule overrides it.
    expect(decls('.sub-tabs__btn:focus-visible')['outline-offset']).toBe('-2px !important');
  });
});
