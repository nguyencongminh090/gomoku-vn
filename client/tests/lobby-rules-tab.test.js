/**
 * #432 — the lobby's Phòng screen has "Đang chơi" / "Luật chơi" tabs; the rule guide is drawn on first open.
 *
 * @jest-environment jsdom
 */
'use strict';

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const JS = fs.readFileSync(path.join(__dirname, '..', 'js', 'lobby-home.js'), 'utf8');

function mount() {
  document.body.innerHTML = HTML.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/gi, '');
}

function wire() {
  window.eval(fs.readFileSync(path.join(__dirname, '..', 'js', 'room-rules-guide.js'), 'utf8'));
  const fn = JS.match(/function wireRoomsTabs\(\) \{[\s\S]*?\n\}\n/)[0];
  new Function('t', fn + '; wireRoomsTabs();')((k) => k); // eslint-disable-line no-new-func
}

describe('Phòng screen rules tab', () => {
  test('markup: two tabs controlling two panels, the room list inside the first, rules hidden', () => {
    mount();
    const tabs = [...document.querySelectorAll('#rooms-tabs [role="tab"]')];
    expect(tabs.map((b) => b.id)).toEqual(['rtab-rooms', 'rtab-rules']);
    expect(document.querySelector('#rooms-main #room-list')).not.toBeNull();
    expect(document.getElementById('rooms-rules').hidden).toBe(true);
    expect(document.getElementById('room-n-playing')).not.toBeNull();
  });

  test('clicking Luật chơi shows the guide (drawn once), clicking back restores the list', () => {
    mount();
    wire();
    const $ = (id) => document.getElementById(id);
    $('rtab-rules').click();
    expect($('rooms-rules').hidden).toBe(false);
    expect($('rooms-main').hidden).toBe(true);
    expect($('rtab-rules').getAttribute('aria-selected')).toBe('true');
    expect($('rooms-rules').querySelectorAll('details').length).toBeGreaterThan(5);
    const first = $('rooms-rules').querySelector('details');
    $('rtab-rooms').click();
    $('rtab-rules').click();
    expect($('rooms-rules').querySelector('details')).toBe(first); // not redrawn
    $('rtab-rooms').click();
    expect($('rooms-main').hidden).toBe(false);
    expect($('rooms-rules').hidden).toBe(true);
  });

  test('room tabs use a single Tab stop and arrow keys select and focus either tab', () => {
    mount();
    wire();
    const rooms = document.getElementById('rtab-rooms');
    const rules = document.getElementById('rtab-rules');
    expect(rules.tabIndex).toBe(-1);
    rooms.focus();
    rooms.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(rules);
    expect(rules.getAttribute('aria-selected')).toBe('true');
    expect(rooms.tabIndex).toBe(-1);
    rules.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(rooms);
    expect(document.getElementById('rooms-rules').hidden).toBe(true);
  });

  test('the singular #room link opens the room hall', () => {
    const fn = JS.match(/function screenFromLocation\(\) \{[\s\S]*?\n\}\n/)[0];
    const screenFromLocation = new Function('location', fn + '; return screenFromLocation();'); // eslint-disable-line no-new-func
    expect(screenFromLocation({ search: '', hash: '#room' })).toBe('rooms');
  });

  test('changing language keeps the expanded rules and focus', () => {
    mount();
    wire();
    document.getElementById('rtab-rules').click();
    const renju = () => document.querySelector('[data-rule="renju"]');
    renju().open = true;
    renju().querySelector('summary').focus();
    window.dispatchEvent(new Event('langchange'));
    expect(renju().open).toBe(true);
    expect(document.activeElement).toBe(renju().querySelector('summary'));
  });
});
