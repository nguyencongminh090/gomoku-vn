/**
 * #429 — room.html and tournament-match.html load js/renju.js with ?v=<hash>.
 *
 * js/* is served immutable, and scripts/cache-bust.js only rewrites refs that already carry ?v=,
 * so a bare `js/renju.js` tag silently kept a stale forbidden-move detector after any change.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CLIENT = path.join(__dirname, '..');

describe('renju.js script tag is cache-busted (#429)', () => {
  it.each(['room.html', 'tournament-match.html'])('%s loads js/renju.js?v=<hash>', (page) => {
    const html = fs.readFileSync(path.join(CLIENT, page), 'utf8');
    const tags = html.match(/<script[^>]*src="js\/renju\.js[^"]*"/g) || [];
    expect(tags.length).toBe(1);
    expect(tags[0]).toMatch(/js\/renju\.js\?v=[0-9a-f]{8}"/);
  });
});
