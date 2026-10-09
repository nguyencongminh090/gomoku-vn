/**
 * TODO.md #178 — clubs list + club page: text-only rendering, role-based controls.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/c/caro"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const body = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');

const CLUB = {
  slug: 'caro', name: '<i>Caro</i>', description: 'desc', joinPolicy: 'invite', members: 2, avgRating: 1500, rank: 3, myRole: null, category: 'freestyle',
  leaderboard: [
    { rank: 1, username: 'own', displayName: 'Own', role: 'owner', rating: 1600, games: 30 },
    { rank: 2, username: 'mem', displayName: 'Mem', role: 'member', rating: null, games: 0 },
  ],
};
const flush = () => new Promise((r) => setTimeout(r, 0));
const ok = (b) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b) });

// Each boot re-requires club.js, which binds document/window listeners; drop the previous boot's
// so they don't act twice on the fresh DOM (a test artifact — the real page loads once).
const bound = [];
for (const target of [document, window]) {
  const add = target.addEventListener.bind(target);
  target.addEventListener = (type, fn, opts) => { bound.push([target, type, fn]); return add(type, fn, opts); };
}

async function bootClub(club) {
  for (const [target, type, fn] of bound.splice(0)) {
    if (type === 'DOMContentLoaded' || type === 'hashchange') target.removeEventListener(type, fn);
  }
  jest.resetModules();
  document.body.innerHTML = body('club.html');
  window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
  global.fetch = jest.fn(() => ok(club));
  require('../js/platform-shell.js');
  require('../js/club.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await flush(); await flush();
}

describe('club page', () => {
  it('renders names as text; non-member sees Request (invite club) and no manage panel', async () => {
    await bootClub(CLUB);
    expect(global.fetch.mock.calls[0][0]).toContain('/api/clubs/caro?category=freestyle');
    expect(document.getElementById('cb-name').textContent).toBe('<i>Caro</i>');
    expect(document.querySelector('#cb-name i')).toBeNull();
    expect(document.getElementById('cb-join').hidden).toBe(false);
    expect(document.getElementById('cb-join').textContent).toBe('clubs.request');
    expect([...document.querySelectorAll('#cb-stats dd')].map((d) => d.textContent)).toEqual(['2', '1500', '#3']);
    expect(document.getElementById('cb-manage').hidden).toBe(true);
    expect(document.querySelectorAll('#cb-body tr')).toHaveLength(2);
    expect(document.querySelectorAll('#cb-body tr')[1].children[2].textContent).toBe('—');
    expect(document.querySelectorAll('#cb-members-body tr')).toHaveLength(2);
    expect(document.querySelectorAll('#cb-members-body tr')[0].children[1].textContent).toBe('clubs.role_owner');
  });

  it('owner sees manage panel, delete, kick/transfer on others, but no leave', async () => {
    await bootClub({ ...CLUB, myRole: 'owner', pending: [{ username: 'p', displayName: 'P' }] });
    expect(document.getElementById('cb-manage').hidden).toBe(false);
    expect(document.getElementById('cb-delete').hidden).toBe(false);
    expect(document.getElementById('cb-leave').hidden).toBe(true);
    expect(document.getElementById('cb-join').hidden).toBe(true);
    const memRow = document.querySelectorAll('#cb-members-body tr')[1];
    expect(memRow.querySelectorAll('button')).toHaveLength(3); // kick, promote, transfer
    expect(document.querySelectorAll('#cb-members-body tr')[0].querySelectorAll('button')).toHaveLength(0);
    expect(document.querySelectorAll('#cb-pending button')).toHaveLength(2);
  });

  it('officer can kick members but cannot change roles', async () => {
    await bootClub({ ...CLUB, myRole: 'officer' });
    expect(document.getElementById('cb-delete').hidden).toBe(true);
    expect(document.querySelectorAll('#cb-members-body tr')[1].querySelectorAll('button')).toHaveLength(1);
  });

  it('pending requester can cancel', async () => {
    await bootClub({ ...CLUB, myRole: 'pending' });
    expect(document.getElementById('cb-leave').hidden).toBe(false);
    expect(document.getElementById('cb-leave').textContent).toBe('clubs.cancel_request');
  });

  describe('tabs (#200)', () => {
    const shown = () => ['overview', 'members', 'board'].filter((n) => !document.getElementById('cb-panel-' + n).hidden);
    const selected = () => ['overview', 'members', 'board'].filter((n) => document.getElementById('cb-tab-' + n).getAttribute('aria-selected') === 'true');
    const click = (n) => document.getElementById('cb-tab-' + n).click();

    beforeEach(() => { location.hash = ''; });

    it('opens on Tổng quan by default; exactly one panel shown and one tab selected', async () => {
      await bootClub(CLUB);
      expect(shown()).toEqual(['overview']);
      expect(selected()).toEqual(['overview']);
    });

    it('clicking a tab swaps the panel and writes #tab=; reload restores it', async () => {
      await bootClub(CLUB);
      click('board');
      expect(shown()).toEqual(['board']);
      expect(location.hash).toBe('#tab=board');
      await bootClub(CLUB);
      expect(shown()).toEqual(['board']);
      expect(selected()).toEqual(['board']);
    });

    it('unknown #tab falls back to overview', async () => {
      location.hash = '#tab=chat';
      await bootClub(CLUB);
      expect(shown()).toEqual(['overview']);
    });

    it('arrow keys move between tabs and wrap; only the active tab is tabbable', async () => {
      await bootClub(CLUB);
      const list = document.getElementById('cb-tablist');
      list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      expect(shown()).toEqual(['members']);
      list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      expect(shown()).toEqual(['board']);
      expect(['overview', 'members', 'board'].map((n) => document.getElementById('cb-tab-' + n).tabIndex)).toEqual([-1, -1, 0]);
    });

    it('staff tools live in Tổng quan, member management in Thành viên, ratings only in the board', async () => {
      await bootClub({ ...CLUB, myRole: 'owner', pending: [] });
      expect(document.getElementById('cb-panel-overview').contains(document.getElementById('cb-manage'))).toBe(true);
      expect(document.getElementById('cb-panel-members').querySelectorAll('button').length).toBeGreaterThan(0);
      expect(document.getElementById('cb-panel-board').querySelectorAll('tbody button')).toHaveLength(0);
    });

    it('a reload of the data (e.g. after kick) keeps the current tab', async () => {
      await bootClub({ ...CLUB, myRole: 'owner' });
      click('members');
      document.getElementById('cb-form').onsubmit(new Event('submit'));
      await flush(); await flush();
      expect(shown()).toEqual(['members']);
    });
  });
});
