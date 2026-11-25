/**
 * #463 — every local script on club.html carries ?v=<hash>.
 *
 * js/* is served immutable and scripts/cache-bust.js only rewrites refs that already carry ?v=<hex>,
 * so a bare `<script src="js/club-policy.js">` was never versioned (same class as #429 renju.js).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'club.html'), 'utf8');
const srcs = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]).filter((s) => !/^(https?:)?\/\//.test(s));

describe('club.html scripts are cache-busted (#463)', () => {
  it('finds the page scripts, including js/club-policy.js', () => {
    expect(srcs.some((s) => s.startsWith('js/club-policy.js'))).toBe(true);
  });
  it.each(srcs)('%s has ?v=<8-hex hash>', (src) => {
    expect(src).toMatch(/\?v=[0-9a-f]{8}$/);
  });
});
