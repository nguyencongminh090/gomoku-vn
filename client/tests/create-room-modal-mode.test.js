/**
 * Create-room modal (Arena) — rated/friendly choice maps onto room.settings.ranked.
 * @jest-environment jsdom
 */
'use strict';
const fs = require('fs');
const path = require('path');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');

describe('create-room modal: rated / friendly', () => {
  const html = read('index.html');
  const lobby = read('js/lobby.js');
  const i18n = read('js/i18n.js');

  test('modal has a roomMode radio pair, rated checked by default', () => {
    document.body.innerHTML = html.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
    const rated = document.getElementById('rm-rated');
    const friendly = document.getElementById('rm-friendly');
    expect(rated.checked).toBe(true);
    expect(friendly.name).toBe('roomMode');
    expect(document.getElementById('modal-create').contains(rated)).toBe(true);
  });

  test('lobby.js submits and restores `ranked`', () => {
    expect(lobby).toMatch(/ranked,\s*ruleWall/);
    expect(lobby).toMatch(/name="roomMode"\]:checked/);
    expect(lobby).toMatch(/ranked:\s*true/);
    expect(lobby).toMatch(/s\.ranked === false \? 'friendly' : 'rated'/);
  });

  test.each(['modal.mode', 'modal.mode_rated_desc', 'modal.mode_friendly_desc', 'modal.mode_guest_note', 'modal.win_rule', 'modal.opening'])(
    'i18n key %s exists in vi and en', (k) => {
      expect(i18n.split(`'${k}':`).length - 1).toBe(2);
    });
});
