/**
 * #470 — the match board once rendered at 150 px on desktop because .board-area had no real box without the
 * Arena layout. The page now shares room.html's layout, which gives it that box; jsdom has no layout, so this
 * pins the wiring. Pixel sizes are checked in a real browser.
 */

'use strict';

const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('tournament-match.html');

describe('tournament match page shares the room layout (#470)', () => {
  it('uses body.arena-room and loads room-arena.css', () => {
    expect(html).toMatch(/<body class="arena-room tmatch-room">/);
    expect(html).toMatch(/css\/room-arena\.css\?v=/);
  });

  it('keeps the .room > .board-area-shell > .board-area > #board-wrap structure', () => {
    expect(html).toMatch(/<main class="room"[\s\S]*class="board-area-shell"[\s\S]*class="board-area" id="board-area"[\s\S]*class="board-canvas-wrap" id="board-wrap"/);
  });

  it('the shared arena rules still give the board area a full-size box', () => {
    expect(read('css/room-arena.css')).toMatch(/body\.arena-room \.board-area \{\s*width: 100%; height: 100%;/);
  });

  it('tournament.css no longer overrides the board box', () => {
    expect(read('css/tournament.css')).not.toMatch(/\.board-area/);
  });
});
