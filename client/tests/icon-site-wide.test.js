/**
 * TODO.md #214 Scope 2 — one modern icon set (Phosphor sprite) across the whole site.
 *
 * Static guards (mockups excluded):
 *  - text glyphs / emoji standing in for icons are gone (✕ close, ← back, ↺ ↻ rotate, ✓ solved, 🔊 🔇 🎉);
 *  - legacy screens (lobby, room, tournament, diag) use the 16/20/24 scale — no 12–15px or 18px icons;
 *  - main actions lead with an icon from the registry (docs/knowledge/ui-ux/iconography.md).
 * Kept as text on purpose: ⚠ in chat system lines, 💬 in document.title, ✕/○ replay names (X/O piece symbols),
 * the room strip ▶ turn marker (a deliberate 9px column, see room.css).
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CLIENT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(CLIENT, rel), 'utf8');
const parse = (rel) => new DOMParser().parseFromString(read(rel), 'text/html');
const iconOf = (node) => node.querySelector('svg use').getAttribute('href').split('#')[1];

describe('#214 Scope 2: site-wide icons', () => {
  test('modal close buttons are the sprite x, not a ✕ glyph', () => {
    for (const page of ['index.html', 'tournament.html']) {
      const closes = [...parse(page).querySelectorAll('.modal__close')];
      expect(closes.length).toBeGreaterThan(0);
      for (const b of closes) {
        expect(b.textContent.trim()).toBe('');
        expect(iconOf(b)).toBe('ph-bold-x');
        expect(b.getAttribute('aria-label')).toBeTruthy();
      }
    }
  });

  test('JS-built controls use sprite icons instead of glyphs', () => {
    expect(read('js/private-chat.js')).not.toMatch(/pm-window__close[^>]*>✕</);
    expect(read('js/room-ui.js')).not.toMatch(/slot-card__stand[^>]*>✕</);
    expect(read('js/puzzle-editor.js')).not.toMatch(/el\('button', '✕'/);
    expect(read('js/avatar-crop.js')).not.toMatch(/[↺↻]/);
    expect(read('js/puzzles.js')).not.toMatch(/'✓ '/);
  });

  test('back links lead with arrow-left; their strings carry no ← glyph', () => {
    for (const [page, key] of [['forum-thread.html', 'forum.back'], ['puzzle.html', 'puzzles.back'], ['puzzle-editor.html', 'puzzles.mine_back']]) {
      const a = parse(page).querySelector(`[data-i18n="${key}"]`).closest('a');
      expect(iconOf(a)).toBe('ph-regular-arrow-left');
      expect(a.textContent).not.toMatch(/←/);
    }
    const i18n = read('js/i18n.js');
    for (const key of ['forum.back', 'puzzles.back', 'puzzles.mine_back']) {
      expect(i18n).not.toMatch(new RegExp(`'${key.replace('.', '\\.')}': '←`));
    }
  });

  test('no emoji icons inside i18n strings', () => {
    expect(read('js/i18n.js')).not.toMatch(/[🔊🔇🎉]/u);
  });

  test('legacy screens: no icon below 16px and no off-scale 18px', () => {
    const bad = [];
    for (const f of ['lobby.css', 'lobby-zen.css', 'room-zen.css', 'tournament.css', 'diag.css']) {
      for (const line of read('css/' + f).split('\n')) {
        if (!/\.icon\b[^{]*\{/.test(line)) continue;
        if (/(font-size|width|height):\s*(1[2-58])px/.test(line)) bad.push(f + ': ' + line.trim());
      }
    }
    expect(bad).toEqual([]);
  });

  test('main actions lead with a registry icon', () => {
    expect(iconOf(parse('forum.html').getElementById('fm-new-btn'))).toBe('ph-regular-plus-circle');
    expect(iconOf(parse('clubs.html').getElementById('cl-create-toggle'))).toBe('ph-regular-plus-circle');
    for (const page of ['puzzles.html', 'puzzles-mine.html']) {
      expect(iconOf(parse(page).querySelector('a[href="/puzzles/new"]'))).toBe('ph-regular-plus-circle');
    }
    const ed = parse('puzzle-editor.html');
    expect(iconOf(ed.getElementById('ed-add-answer'))).toBe('ph-regular-plus-circle');
    expect(ed.getElementById('ed-add-answer').textContent).not.toMatch(/\+/);
    expect(iconOf(ed.getElementById('ed-submit'))).toBe('ph-regular-paper-plane-tilt');
    // Button text sits in a span so i18n can translate it without wiping the icon.
    for (const id of ['ed-add-answer', 'ed-submit']) expect(ed.getElementById(id).hasAttribute('data-i18n')).toBe(false);
    expect(read('js/lobby-home.js')).toMatch(/t\('home\.find_room'\)[^\n]*'ph-regular-magnifying-glass'/);
    expect(read('js/puzzle-editor.js')).toMatch(/ph-fill-circle[\s\S]*ph-fill-circle[\s\S]*ph-regular-eraser[\s\S]*ph-regular-target/);
    expect(read('js/puzzle-editor.js')).toMatch(/pz-stone--/);
    // The rendered label comes from i18n, so the string must not carry the glyph either.
    expect(read('js/i18n.js')).not.toMatch(/'puzzles\.add_answer': '\+/);
  });
});
