/**
 * TODO.md #212 — icon + label review.
 *
 * Static guards over the shipped pages (mockups excluded):
 *  - every sprite icon a page or module references exists in phosphor-sprite.svg
 *    (a missing <symbol> renders as nothing, silently);
 *  - no text glyphs standing in for sprite icons (⌕ search, ⏳ overlay);
 *  - one icon per concept: sword = challenge, so "Vào bằng mã" is a door;
 *    shield-check = admin, so the Settings Account tab is user-gear;
 *  - icon-only ✕ close buttons carry a name;
 *  - the labels shortened here stay short.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CLIENT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(CLIENT, rel), 'utf8');
const SPRITE = read('assets/icons/phosphor-sprite.svg');
const symbols = new Set([...SPRITE.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.js$/.test(e.name)) out.push(p);
  }
  return out;
}
const PAGES = fs.readdirSync(CLIENT).filter((f) => f.endsWith('.html') && !f.includes('mockup'));
const SOURCES = [...PAGES.map((f) => path.join(CLIENT, f)), ...walk(path.join(CLIENT, 'js'))];

function parse(rel) {
  return new DOMParser().parseFromString(read(rel), 'text/html');
}
const iconOf = (node) => node.querySelector('use').getAttribute('href').split('#')[1];

describe('icon + label review (#212)', () => {
  test('every referenced ph-* icon exists in the sprite', () => {
    const missing = [];
    for (const file of SOURCES) {
      const src = fs.readFileSync(file, 'utf8');
      for (const [name] of src.matchAll(/ph-(?:regular|bold|fill)-[a-z0-9]+(?:-[a-z0-9]+)*/g)) {
        if (!symbols.has(name)) missing.push(path.relative(CLIENT, file) + ': ' + name);
      }
    }
    expect(missing).toEqual([]);
  });

  test('no text glyphs used as icons on the pages', () => {
    const hits = PAGES.filter((f) => /[⌕⏳]/.test(read(f)));
    expect(hits).toEqual([]);
  });

  test('search fields use the sprite magnifier', () => {
    for (const page of ['rankings.html', 'clubs.html']) {
      expect(iconOf(parse(page).querySelector('.psearch'))).toBe('ph-regular-magnifying-glass');
    }
  });

  test('one icon per concept: join-by-code is a door, not the challenge sword', () => {
    expect(iconOf(parse('index.html').getElementById('btn-join-code'))).toBe('ph-regular-door-open');
  });

  test('settings: Account tab is not the admin shield; who-can-DM is a chat bubble, not the bio icon', () => {
    const doc = parse('settings.html');
    expect(iconOf(doc.getElementById('tab-account'))).toBe('ph-regular-user-gear');
    expect(iconOf(doc.querySelector('label[for="st-dm"]'))).toBe('ph-regular-chat-circle');
    expect(iconOf(doc.querySelector('label[for="st-bio"]'))).not.toBe(iconOf(doc.querySelector('label[for="st-dm"]')));
  });

  test('settings: tab labels stay visible on mobile (#214 supersedes the #212 visually-hidden labels)', () => {
    const css = read('css/platform.css');
    expect(css).not.toMatch(/\.pset__tabs \.ptab[^{]*span \{[^}]*(display: none|clip-path)/);
  });

  test('#214: no icon below 16px on platform pages (sizes come from --icon-sm/md/lg or ≥ 16px)', () => {
    const small = [];
    for (const file of ['css/platform.css', 'css/platform-shell.css']) {
      for (const [, sel, body] of read(file).matchAll(/([^{}]*(?:\.icon|svg)[^{}]*)\{([^}]*)\}/g)) {
        for (const [, px] of body.matchAll(/(?:^|[\s;])(?:width|height):\s*(\d+)px/g)) if (Number(px) < 16) small.push(file + ': ' + sel.trim() + ' ' + px + 'px');
      }
    }
    expect(small).toEqual([]);
  });

  test.each(PAGES)('%s: every ✕ close button has an accessible name', (page) => {
    const unnamed = [...parse(page).querySelectorAll('button')]
      .filter((b) => b.textContent.trim() === '✕' && !b.getAttribute('aria-label') && !b.getAttribute('title'))
      .map((b) => b.outerHTML.slice(0, 80));
    expect(unnamed).toEqual([]);
  });

  test('shortened labels stay short (vi and en)', () => {
    const src = read('js/i18n.js');
    const keys = ['profile.bio_label', 'clubs.desc', 'settings.who_dm', 'settings.who_challenge', 'settings.who_friend',
      'qm.find_rated', 'qm.challenge_friend', 'tdetail.back', 'tmatch.back'];
    for (const key of keys) {
      const values = [...src.matchAll(new RegExp("'" + key.replace('.', '\\.') + "': '([^']*)'", 'g'))].map((m) => m[1]);
      expect(values.length).toBeGreaterThan(0);
      for (const v of values) expect([key, v, v.length <= 20]).toEqual([key, v, true]);
    }
  });

  test('the 280-character limit moved from the label into the placeholder', () => {
    expect(parse('settings.html').getElementById('st-bio').getAttribute('data-i18n-placeholder')).toBe('common.max_280');
    expect(parse('clubs.html').getElementById('cl-desc').getAttribute('data-i18n-placeholder')).toBe('common.max_280');
    expect(parse('club.html').getElementById('cb-desc-input').getAttribute('data-i18n-placeholder')).toBe('common.max_280');
  });
});
