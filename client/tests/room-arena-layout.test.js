/**
 * TODO.md #216 — room layout "Arena Focus" (replaces the zen drawer/sheet and
 * its tests: room-drawer-inert, room-zen-drawer-collapsed-recovery,
 * room-zen-start-modal-above-sheet, room-tab-activation-drawer).
 *
 * Holds down what the layout relies on:
 *   - room.html's rail order (opponent card · panel · actions · your card) and
 *     that requests/confirm toasts live in the panel, not over the board;
 *   - tab activation (RoomTabs.activate + clicks), bound once per document even
 *     when a stale ?v= cross-import evaluates room.js twice (#136's hazard);
 *   - §B36: the start modal overlay never catches clicks itself.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/room.html?id=%23ABC"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'room.html'), 'utf8');
const BODY_HTML = HTML.match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];
const GAME_CSS = fs.readFileSync(path.join(__dirname, '..', 'css', 'game.css'), 'utf8');
const ARENA_CSS = fs.readFileSync(path.join(__dirname, '..', 'css', 'room-arena.css'), 'utf8');

function setupPage() {
  document.body.innerHTML = BODY_HTML;
  document.body.className = 'arena-room';
  delete document.body.dataset.roomTabsBound;
  window.GvnSession = {
    requireAuth: jest.fn(),
    getUser: jest.fn(() => ({ userId: 'u-1', displayName: 'Test User', isGuest: false })),
  };
  window.t = jest.fn((key) => key);
  window.requestAnimationFrame = jest.fn((cb) => cb());
  window.SocketClient = class { emit() {} on() {} bindStatusBanner() {} };
  window.matchMedia = jest.fn(() => ({ matches: false, addEventListener: jest.fn(), removeEventListener: jest.fn() }));
}

function loadRoomModule() {
  jest.resetModules();
  require('../js/room.js');
}

const tabBtn = (id) => document.querySelector(`.tab-btn[data-tab="${id}"]`);
const activeTab = () => document.querySelector('.tab-btn--active')?.getAttribute('data-tab');
const activePanes = () => [...document.querySelectorAll('.tab-content--active')].map(e => e.id);

describe('room.html structure', () => {
  beforeEach(setupPage);

  test('body is the arena layout; the zen stylesheet and drawer markup are gone', () => {
    expect(HTML).toMatch(/<body class="arena-room">/);
    expect(HTML).toMatch(/css\/room-arena\.css\?v=[0-9a-f]+/);
    expect(HTML).not.toMatch(/room-zen\.css/);
    expect(document.querySelector('.panel-right-shell')).toBeNull();
    expect(document.getElementById('quick-chat-bar')).toBeNull();
  });

  test('the rail reads opponent card · panel · actions · your card', () => {
    const kids = [...document.querySelector('.rail').children].map(e => e.id || e.className);
    expect(kids).toEqual(['seatcard-top', 'rpanel', 'game-controls', 'seatcard-bottom']);
  });

  test('request + confirm areas live in the panel toasts, never inside the board area', () => {
    for (const id of ['draw-prompt-area', 'time-prompt-area', 'undo-prompt-area', 'confirm-prompt-area']) {
      const el = document.getElementById(id);
      expect(el).not.toBeNull();
      expect(el.closest('#game-toasts')).not.toBeNull();
      expect(el.closest('#board-area-shell')).toBeNull();
    }
  });

  test('tabs: Nước đi · Chat · Khán giả (score inside) · Cài đặt; Chat open by default', () => {
    const tabs = [...document.querySelectorAll('.tab-btn')].map(b => b.dataset.tab);
    expect(tabs).toEqual(['tab-moves', 'tab-chat', 'tab-users', 'tab-settings']);
    expect(document.getElementById('score-panel').closest('#tab-users')).not.toBeNull();
    expect(activeTab()).toBe('tab-chat');
  });

  test('phones: the rail dissolves into the page column in the designed order', () => {
    const mobile = ARENA_CSS.slice(ARENA_CSS.indexOf('@media (max-width: 768px)'));
    expect(mobile).toMatch(/\.rail \{ display: contents; \}/);
    const order = (sel) => Number((mobile.match(new RegExp(sel.replace('.', '\\.') + ' \\{[^}]*order: (\\d)')) || [])[1]);
    expect([order('.seatcard--top'), order('.board-area-shell'), order('.seatcard--bottom'), order('.game-controls'), order('.rpanel')])
      .toEqual([1, 2, 3, 4, 5]);
  });
});

describe('tabs', () => {
  beforeEach(setupPage);

  test('click and RoomTabs.activate switch tab + pane together', () => {
    loadRoomModule();
    tabBtn('tab-moves').click();
    expect(activeTab()).toBe('tab-moves');
    expect(activePanes()).toEqual(['tab-moves']);
    window.RoomTabs.activate('tab-settings');
    expect(activeTab()).toBe('tab-settings');
    expect(activePanes()).toEqual(['tab-settings']);
  });

  test('an unknown tab id is a no-op, not a crash', () => {
    loadRoomModule();
    tabBtn('tab-users').click();
    expect(() => window.RoomTabs.activate('tab-nope')).not.toThrow();
    expect(activeTab()).toBe('tab-users');
  });

  test('a double module load binds the click once', () => {
    loadRoomModule();
    loadRoomModule();
    const spy = jest.spyOn(window.RoomTabs, 'activate');
    tabBtn('tab-users').click();
    expect(activeTab()).toBe('tab-users');
    expect(activePanes()).toEqual(['tab-users']);
    spy.mockRestore();
  });
});

describe('start modal (§B36)', () => {
  test('the overlay never catches clicks; only its card does', () => {
    expect(/\.start-modal\s*\{[^}]*pointer-events:\s*none/.test(GAME_CSS)).toBe(true);
    expect(/\.start-modal__card\s*\{[^}]*pointer-events:\s*auto/.test(GAME_CSS)).toBe(true);
  });

  test('it stays a sibling of #board-area (initBoard replaces #board-area)', () => {
    setupPage();
    const modal = document.getElementById('start-modal');
    expect(modal.parentElement.id).toBe('board-area-shell');
  });
});

describe('request toasts on a minimized phone panel (#329)', () => {
  test('minimized: toasts are in flow, not absolute over the 93px panel (covered chat bar, clipped ✓/✕)', () => {
    const phone = ARENA_CSS.slice(ARENA_CSS.indexOf('@media (max-width: 768px) {\n  body.arena-room { --nav-h: 48px; }'));
    expect(/\.rpanel--min \.gtoasts\s*\{[^}]*position:\s*static/.test(phone)).toBe(true);
  });
});
