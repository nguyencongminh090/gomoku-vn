/**
 * B193 — lobby on the site-wide Arena shell: the shell's "Giải đấu" link is
 * /index.html#tournaments, so tournaments.js keeps tab ↔ hash ↔ nav marker in step,
 * and the bar's single action slot shows only the active tab's create button.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const BODY = read('index.html').match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');
// tournaments.js is an ES module importing lobby.js; swap that import for stubs.
const TOURNAMENTS = read('js/tournaments.js').replace(/^import [^\n]*lobby\.js[^\n]*\n/m,
  'const { client, setHeroTab, setHeroTournamentCount } = window.__lobbyStub;\n');
const SHELL = read('js/platform-shell.js');

function boot(url = '/index.html') {
  window.history.replaceState(null, '', url);
  document.body.innerHTML = BODY;
  window.t = (k) => k;
  window.GvnSession = { getUser: () => null };
  window.EscapeUtils = { escapeAttr: (s) => s, escapeHtml: (s) => s };
  window.__lobbyStub = {
    client: { on() { return this; }, off() {}, emit() {}, emitAck() {}, socket: { connected: false } },
    setHeroTab: jest.fn(),
    setHeroTournamentCount: jest.fn(),
  };
  window.eval(SHELL);
  window.PlatformShell.build('lobby');
  window.eval(TOURNAMENTS);
}

const navOn = () => [...document.querySelectorAll('#pl-shell .is-active')].map((a) => a.dataset.tab);
const shown = () => ['btn-create', 'btn-create-tournament'].filter((id) => !document.getElementById(id).hidden);

describe('lobby tab ↔ #tournaments ↔ shell nav', () => {
  it('plain /index.html → tables tab, Tạo phòng only, Chơi marked', () => {
    boot();
    expect(document.getElementById('panel-tables').classList.contains('is-active')).toBe(true);
    expect(shown()).toEqual(['btn-create']);
    expect(navOn()).toEqual(['lobby', 'lobby']);
  });

  it('#tournaments on load → tournaments tab, Tạo giải đấu only, Giải đấu marked', () => {
    boot('/index.html#tournaments');
    expect(document.getElementById('panel-tournaments').classList.contains('is-active')).toBe(true);
    expect(shown()).toEqual(['btn-create-tournament']);
    expect(navOn()).toEqual(['tournaments', 'tournaments']);
    expect(window.__lobbyStub.setHeroTab).toHaveBeenLastCalledWith('tournaments');
  });

  it('legacy ?tab=tournaments still lands on the tab and ends up as #tournaments', () => {
    boot('/index.html?tab=tournaments');
    expect(document.getElementById('panel-tournaments').classList.contains('is-active')).toBe(true);
    expect(location.search).toBe('');
    expect(location.hash).toBe('#tournaments');
  });

  it('clicking the tabs writes the hash and moves the nav marker; back to tables clears it', () => {
    boot();
    document.getElementById('tab-tournaments').click();
    expect(location.hash).toBe('#tournaments');
    expect(navOn()).toEqual(['tournaments', 'tournaments']);
    document.getElementById('tab-tables').click();
    expect(location.hash).toBe('');
    expect(navOn()).toEqual(['lobby', 'lobby']);
    expect(shown()).toEqual(['btn-create']);
  });

  it('hashchange (shell link clicked while on the lobby) switches the tab', () => {
    boot();
    window.history.replaceState(null, '', '/index.html#tournaments');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(document.getElementById('panel-tournaments').classList.contains('is-active')).toBe(true);
    window.history.replaceState(null, '', '/index.html');
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(document.getElementById('panel-tables').classList.contains('is-active')).toBe(true);
  });

  it('Chơi link on the lobby itself switches to tables instead of reloading', () => {
    boot('/index.html#tournaments');
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    document.querySelector('.pnav__links a[data-tab="lobby"]').dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.getElementById('panel-tables').classList.contains('is-active')).toBe(true);
  });

  it('the old topnav is gone; no nav-duplicate links left in the tables panel', () => {
    boot();
    expect(document.querySelector('.topnav')).toBeNull();
    expect(document.querySelector('#panel-tables a[href="rankings.html"]')).toBeNull();
    expect(document.querySelectorAll('.pnav')).toHaveLength(1);
  });
});
