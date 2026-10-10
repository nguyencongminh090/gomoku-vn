/**
 * TODO.md #215 — Settings: the save bar must really stick, and clear the mobile tab bar.
 *
 * Root cause: main.css gives `html, body` overflow-x:hidden, so `body` computes overflow-y:auto and becomes the
 * scroll container for `position: sticky` — but the viewport is what scrolls, so `.pset__save` never stuck
 * (measured: top 1139px in an 844px viewport, reachable only at the very end of the page). Platform pages
 * (`body.pl`) must use overflow-x:clip, which creates no scroll container. Second, the mobile offset was a
 * hard-coded 60px while the tab bar is taller (67px + safe-area inset).
 *
 * CSS layout can't run in jsdom, so these assert the shipped rules; the real-browser measurement is in the fix-log.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const css = (f) => fs.readFileSync(path.join(__dirname, '..', 'css', f), 'utf8');
const rule = (src, sel) => { const i = src.indexOf('\n' + sel + ' {'); return i < 0 ? '' : src.slice(i, src.indexOf('}', i)); };

describe('#215 Settings save bar', () => {
  test('body.pl does not become a scroll container (overflow-x: clip after the hidden fallback)', () => {
    const body = rule(css('platform.css'), 'body.pl');
    expect(body).toMatch(/overflow-x:\s*hidden;\s*overflow-x:\s*clip/);
  });

  test('the sticky offset uses the tab bar height token + safe-area inset, not a bare 60px', () => {
    const platform = css('platform.css');
    expect(platform).not.toMatch(/\.pset__save \{ bottom: 60px; \}/);
    expect(platform).toMatch(/\.pset__save \{ bottom: calc\(var\(--ptabbar-h\) \+ env\(safe-area-inset-bottom\)\); \}/);
    expect(platform).toMatch(/--ptabbar-h:\s*\d+px/);
  });

  test('the tab bar is exactly that tall (token shared, so they cannot drift apart)', () => {
    const bar = css('platform-shell.css').split('\n').find((l) => /^\s*\.ptabbar \{ display: flex/.test(l));
    expect(bar).toMatch(/box-sizing:\s*border-box/);
    expect(bar).toMatch(/min-height:\s*calc\(var\(--ptabbar-h\) \+ env\(safe-area-inset-bottom\)\)/);
  });
});
