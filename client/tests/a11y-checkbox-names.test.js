/**
 * TODO.md #181 / docs/todo/B181-a11y-unlabelled-checkboxes.md
 * Every checkbox must have an accessible name (axe `label` Critical).
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

describe('checkbox accessible names (#181)', () => {
  test('index.html: every checkbox has a data-i18n-aria key', () => {
    document.body.innerHTML = read('index.html');
    const boxes = [...document.querySelectorAll('input[type=checkbox]')];
    expect(boxes.length).toBeGreaterThanOrEqual(4);
    for (const b of boxes) {
      expect(b.getAttribute('data-i18n-aria')).toMatch(/^modal\.rule_/);
    }
  });

  test('room-ui.js: room-settings checkboxes carry aria-label', () => {
    const src = read('js/room-ui.js');
    const tags = src.match(/<input type="checkbox"[^>]*>/g) || [];
    expect(tags.length).toBeGreaterThanOrEqual(2);
    for (const tag of tags) expect(tag).toContain('aria-label=');
  });

  test('settings-panel toggles get aria-label from the row label', () => {
    jest.resetModules();
    localStorage.clear();
    window.t = (k) => k;
    window.GvnSession = { getUser: () => ({ displayName: 'T', isGuest: false }) };
    window.getUiMode = () => 'lite';
    window.setUiMode = jest.fn();
    window.getLanguage = () => 'vi';
    window.setLanguage = jest.fn();
    document.body.innerHTML = '<nav class="topnav"><div class="topnav__right"></div></nav>';
    require('../js/settings-panel.js');
    document.dispatchEvent(new Event('DOMContentLoaded', { bubbles: true, cancelable: true }));
    window.openSettingsPanel();
    const boxes = [...document.querySelectorAll('.gset-overlay input[type=checkbox]')];
    expect(boxes.length).toBeGreaterThan(0);
    for (const b of boxes) expect(b.getAttribute('aria-label')).toBeTruthy();
  });
});
