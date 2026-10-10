/**
 * Sprite URLs built in JS carry ?v=N.
 *
 * /assets/* is served `immutable, max-age=1y` (server static cache policy), so a sprite URL
 * without ?v= stays pinned to whatever copy the browser first saw: after #212 added
 * ph-regular-play, the lobby "Đấu xếp hạng" icon rendered as an empty gap for returning
 * users whose cached sprite predates it. The ?v= also lets scripts/cache-bust.js bump it.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const JS = path.join(__dirname, '..', 'js');

function jsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsFiles(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

describe('sprite URL in JS is cache-busted', () => {
  it('every phosphor-sprite.svg string literal in client/js has ?v=N', () => {
    const bad = [];
    for (const f of jsFiles(JS)) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/['"`]([^'"`\n]*phosphor-sprite\.svg[^'"`\n]*)['"`]/g)) {
        if (m[1].startsWith('client/')) continue; // repo path in a doc comment
        if (!/phosphor-sprite\.svg\?v=(\d+|\$\{)/.test(m[1])) bad.push(path.relative(JS, f) + ': ' + m[1]);
      }
    }
    expect(bad).toEqual([]);
  });
});
