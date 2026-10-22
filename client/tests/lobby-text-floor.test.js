/**
 * #307 — lobby text floor is --text-xs (12px mobile, tokens.css "Lobby typography round").
 * The create-room modal still had 10.5px / 11.5px literals. No literal font-size under 12px
 * in the lobby stylesheets, except the named exceptions (icons, .pav initials, bell count badge).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const FILES = ['lobby.css', 'lobby-zen.css', 'shell.css', 'platform.css', 'settings-panel.css', 'platform-shell.css'];
const EXEMPT = /(^|[\s,])(\.pav(--xs)?|\.pbell__badge)\b/;

function smallLiterals(css) {
  const out = [];
  css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/([^{}]+)\{([^{}]*)\}/g, (_, sel, body) => {
    const m = body.match(/font-size:\s*(?:calc\()?\s*([0-9.]+)px/);
    if (m && parseFloat(m[1]) < 12 && !EXEMPT.test(sel)) out.push(`${sel.trim().slice(-60)} ${m[1]}px`);
  });
  return out;
}

describe('lobby text floor (#307)', () => {
  it.each(FILES)('%s has no font-size literal under 12px outside the named exceptions', (f) => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', f), 'utf8');
    expect(smallLiterals(css)).toEqual([]);
  });
});
