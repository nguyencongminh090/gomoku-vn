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
  slug: 'caro', name: '<i>Caro</i>', description: 'desc', joinPolicy: 'invite', members: 2, avgRating: 1500, rank: 3, myRole: null, category: 'freestyle', events: [], tournaments: [],
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
  window.EscapeUtils = require('../js/escape-utils.js');
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

    it('Tổng quan = ranking table (top rows) + aside with Sắp tới and Ban quản trị (mockup)', async () => {
      await bootClub(CLUB);
      const ov = document.getElementById('cb-panel-overview');
      expect(ov.querySelectorAll('#cb-ov-body tr')).toHaveLength(2);
      expect(ov.querySelector('aside #cb-events')).not.toBeNull();
      expect(ov.querySelector('aside #cb-staff')).not.toBeNull();
      expect(document.getElementById('cb-ov-title').textContent).toBe('clubs.board · rankings.cat_freestyle');
      expect(ov.querySelectorAll('tbody button')).toHaveLength(0);
    });

    it('Quản lý button: staff only; toggles the manage panel, no tab selected while it is open; non-staff #tab=manage → overview', async () => {
      await bootClub(CLUB);
      expect(document.getElementById('cb-manage-btn').hidden).toBe(true);
      location.hash = '#tab=manage';
      await bootClub(CLUB);
      expect(document.getElementById('cb-panel-manage').hidden).toBe(true);
      expect(document.getElementById('cb-panel-overview').hidden).toBe(false);

      location.hash = '';
      await bootClub({ ...CLUB, myRole: 'officer' });
      const btn = document.getElementById('cb-manage-btn');
      expect(btn.hidden).toBe(false);
      btn.click();
      expect(document.getElementById('cb-panel-manage').hidden).toBe(false);
      expect(document.getElementById('cb-panel-overview').hidden).toBe(true);
      expect(btn.getAttribute('aria-pressed')).toBe('true');
      expect(selected()).toEqual([]);
      expect(location.hash).toBe('#tab=manage');
      click('members');
      expect(document.getElementById('cb-panel-manage').hidden).toBe(true);
      expect(btn.getAttribute('aria-pressed')).toBe('false');
      btn.click();
      btn.click(); // second press goes back to Tổng quan
      expect(shown()).toEqual(['overview']);
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

    it('staff tools live in the Quản lý panel (not Tổng quan), member management in Thành viên, ratings only in the board', async () => {
      await bootClub({ ...CLUB, myRole: 'owner', pending: [] });
      expect(document.getElementById('cb-panel-overview').contains(document.getElementById('cb-manage'))).toBe(false);
      expect(document.getElementById('cb-panel-manage').contains(document.getElementById('cb-manage'))).toBe(true);
      expect(document.getElementById('cb-panel-manage').contains(document.getElementById('cb-delete'))).toBe(true);
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

  describe('events — Sắp tới (#200 slice 2)', () => {
    const EVENTS = [{ id: 'e1', title: '<b>Giao hữu</b>', startsAt: '2026-12-01T13:00:00.000Z', kind: 'event' }];

    it('shows the empty note, then events as text; members get no delete button', async () => {
      await bootClub(CLUB);
      expect(document.getElementById('cb-events').textContent).toBe('clubs.no_events');
      await bootClub({ ...CLUB, myRole: 'member', events: EVENTS });
      expect(document.querySelector('#cb-events .prow__t').textContent).toBe('<b>Giao hữu</b>');
      expect(document.querySelector('#cb-events b')).toBeNull();
      expect(document.querySelectorAll('#cb-events button')).toHaveLength(0);
    });

    it('staff delete sends DELETE /events/:id after confirm', async () => {
      await bootClub({ ...CLUB, myRole: 'officer', events: EVENTS });
      window.confirm = jest.fn(() => true);
      global.fetch.mockClear();
      document.querySelector('#cb-events button').click();
      await flush();
      expect(global.fetch.mock.calls[0][0]).toBe('/api/clubs/caro/events/e1');
      expect(global.fetch.mock.calls[0][1].method).toBe('DELETE');
    });

    it('add form posts title + UTC ISO time', async () => {
      await bootClub({ ...CLUB, myRole: 'owner' });
      document.getElementById('cb-event-title').value = 'Giải tuần';
      document.getElementById('cb-event-when').value = '2030-01-02T20:00';
      global.fetch.mockClear();
      document.getElementById('cb-event-form').onsubmit(new Event('submit'));
      await flush();
      const [url, opts] = global.fetch.mock.calls[0];
      expect(url).toBe('/api/clubs/caro/events');
      expect(JSON.parse(opts.body)).toEqual({ title: 'Giải tuần', startsAt: new Date('2030-01-02T20:00').toISOString() });
    });
  });

  describe('chat (#200 slice 3)', () => {
    const MSGS = [
      { id: 7, text: 'hi &lt;b&gt;x&lt;/b&gt;', createdAt: '2026-10-10T10:00:00.000Z', mine: false, username: 'mem', displayName: 'Mem', avatarUrl: null },
      { id: 8, text: 'second', createdAt: '2026-10-10T10:01:00.000Z', mine: true, username: 'own', displayName: 'Own', avatarUrl: null },
    ];
    const tab = () => document.getElementById('cb-tab-chat');
    const log = () => document.getElementById('cb-chat-log');
    // club JSON for everything except /messages
    async function bootChat(role, msgs = MSGS) {
      await bootClub({ ...CLUB, myRole: role });
      global.fetch = jest.fn((url, opts) => (String(url).includes('/messages')
        ? ok(opts && opts.method === 'POST' ? { id: 9 } : { messages: msgs })
        : ok({ ...CLUB, myRole: role })));
    }

    beforeEach(() => { location.hash = ''; });

    it('tab is hidden for non-members/pending and #tab=chat falls back to overview', async () => {
      for (const role of [null, 'pending']) {
        location.hash = '#tab=chat';
        await bootClub({ ...CLUB, myRole: role });
        expect(tab().hidden).toBe(true);
        expect(document.getElementById('cb-panel-chat').hidden).toBe(true);
        expect(document.getElementById('cb-panel-overview').hidden).toBe(false);
      }
    });

    it('members get the tab; opening it loads messages once, rendered as decoded text', async () => {
      await bootChat('member');
      expect(tab().hidden).toBe(false);
      tab().click();
      await flush(); await flush();
      expect(global.fetch.mock.calls.filter(([u]) => String(u).includes('/messages'))).toHaveLength(1);
      expect([...document.querySelectorAll('.cb-chat__text')].map((n) => n.textContent)).toEqual(['hi <b>x</b>', 'second']);
      expect(log().querySelector('b')).toBeNull();
      expect(document.querySelectorAll('.cb-chat__msg button')).toHaveLength(0);
      document.getElementById('cb-tab-members').click();
      tab().click();
      await flush();
      expect(global.fetch.mock.calls.filter(([u]) => String(u).includes('/messages'))).toHaveLength(1);
    });

    it('staff see a delete button per message; delete sends DELETE then reloads', async () => {
      await bootChat('officer');
      tab().click();
      await flush(); await flush();
      expect(document.querySelectorAll('.cb-chat__msg button')).toHaveLength(2);
      window.confirm = jest.fn(() => true);
      global.fetch.mockClear();
      document.querySelector('.cb-chat__msg button').click();
      await flush(); await flush();
      expect(global.fetch.mock.calls[0][0]).toBe('/api/clubs/caro/messages/7');
      expect(global.fetch.mock.calls[0][1].method).toBe('DELETE');
    });

    it('send posts {text}, clears the input, then fetches only newer messages', async () => {
      await bootChat('member');
      tab().click();
      await flush(); await flush();
      global.fetch.mockClear();
      document.getElementById('cb-chat-input').value = '  xin chào ';
      document.getElementById('cb-chat-form').onsubmit(new Event('submit'));
      await flush(); await flush(); await flush();
      const [post, poll] = global.fetch.mock.calls;
      expect(post[0]).toBe('/api/clubs/caro/messages');
      expect(JSON.parse(post[1].body)).toEqual({ text: 'xin chào' });
      expect(poll[0]).toBe('/api/clubs/caro/messages?after=8');
      expect(document.getElementById('cb-chat-input').value).toBe('');
    });

    it('empty chat shows the empty note; a full page offers older messages', async () => {
      await bootChat('member', []);
      tab().click();
      await flush(); await flush();
      expect(document.getElementById('cb-chat-empty').hidden).toBe(false);
      expect(document.getElementById('cb-chat-older').hidden).toBe(true);
      const full = Array.from({ length: 50 }, (_, k) => ({ ...MSGS[0], id: 100 + k }));
      await bootChat('member', full);
      tab().click();
      await flush(); await flush();
      expect(document.getElementById('cb-chat-older').hidden).toBe(false);
    });
  });

  describe('club tournaments (#200 slice 4)', () => {
    const TOURS = [
      { id: 't<1>', name: '<b>Cup</b>', format: 'swiss', status: 'draft', createdAt: '2026-10-10T10:00:00.000Z', startedAt: null, players: 3 },
      { id: 't2', name: 'Done', format: 'swiss', status: 'completed', createdAt: '2026-09-01T10:00:00.000Z', startedAt: '2026-09-02T10:00:00.000Z', players: 8 },
    ];
    beforeEach(() => { location.hash = ''; sessionStorage.clear(); });

    it('shows the empty note; lists tournaments as text links with status and players', async () => {
      await bootClub(CLUB);
      expect(document.getElementById('cb-tournaments').textContent).toBe('clubs.no_tournaments');
      await bootClub({ ...CLUB, tournaments: TOURS });
      const rows = document.querySelectorAll('#cb-tournaments a.prow');
      expect(rows).toHaveLength(2);
      expect(rows[0].querySelector('.prow__t').textContent).toBe('<b>Cup</b>');
      expect(rows[0].querySelector('b')).toBeNull();
      expect(rows[0].getAttribute('href')).toBe('/tournament.html?id=t%3C1%3E');
      expect(rows[0].querySelector('.prow__m').textContent).toContain('clubs.tstatus_draft');
      expect(rows[0].querySelector('.prow__m').textContent).toContain('3 clubs.tplayers');
    });

    it('create button is staff-only and hands the club slug over via sessionStorage', async () => {
      for (const role of [null, 'member']) {
        await bootClub({ ...CLUB, myRole: role });
        expect(document.getElementById('cb-tournament-new').hidden).toBe(true);
      }
      await bootClub({ ...CLUB, myRole: 'officer' });
      expect(document.getElementById('cb-tournament-new').hidden).toBe(false);
      const quiet = jest.spyOn(console, 'error').mockImplementation(() => {}); // jsdom: navigation not implemented
      document.getElementById('cb-tournament-new').click();
      quiet.mockRestore();
      expect(sessionStorage.getItem('gvn_club_tournament')).toBe('caro');
    });
  });
});
