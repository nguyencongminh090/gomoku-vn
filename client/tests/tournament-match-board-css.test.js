/**
 * #470 — tournament-match.html board rendered at 150 px on desktop: .board-area (room.css, flex 0 0 auto in
 * a centred column shell) was shrink-to-fit, so BoardRenderer.resize() measured a ~0 px #board-wrap with the
 * svg hidden and fell to its size floor. room.html escapes it only via body.arena-room, which this page lacks.
 * jsdom has no layout, so this pins the page wiring + desktop rules; pixel sizes were probed in a real browser
 * (features/club-platform/verify.cjs e2e2 PROBE_ONLY: 1366×900 → 561 px, 1920×1080 → 748 px, 390 → 389 px).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'tournament.css'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'tournament-match.html'), 'utf8');

/** Body of the `@media (min-width: 769px)` block(s), braces balanced. */
function desktopBlocks() {
  const out = [];
  const re = /@media\s*\(min-width:\s*769px\)\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    let depth = 1, i = re.lastIndex;
    for (; i < css.length && depth; i++) depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0;
    out.push(css.slice(re.lastIndex, i - 1));
  }
  return out.join('\n');
}
function decls(block, sel) {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = block.match(new RegExp('(^|\\n)\\s*' + esc + '\\s*\\{([^}]*)\\}'));
  if (!m) throw new Error('rule not found: ' + sel);
  return Object.fromEntries(m[2].split(';').map((d) => d.split(':').map((x) => x.trim())).filter((d) => d.length === 2 && d[0]));
}

describe('tournament match board gets a real box on desktop (#470)', () => {
  it('page uses the shared .room > .board-area-shell > .board-area > #board-wrap structure, no arena-room', () => {
    expect(html).toMatch(/<main class="room"/);
    expect(html).toMatch(/class="board-area" id="board-area"/);
    expect(html).toMatch(/class="board-canvas-wrap match-board-canvas-wrap" id="board-wrap"/);
    expect(html).not.toMatch(/arena-room/);
  });

  it('desktop .board-area stretches to the shell width (not shrink-to-fit)', () => {
    expect(decls(desktopBlocks(), '.room .board-area')['align-self']).toBe('stretch');
  });

  it('desktop shell height is content-driven so resize() fits the board to the viewport below it', () => {
    expect(decls(desktopBlocks(), '.room .board-area-shell').height).toBe('auto');
  });
});
