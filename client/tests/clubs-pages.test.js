/**
 * TODO.md #178 — clubs list + club page: text-only rendering, role-based controls.
 * #446: the page is the "Hội quán" shell (rail, channels, centre, members pane); tabs became channels.
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

// ...and its 8 s chat tick: an old boot's interval firing mid-test appended rows to the fresh DOM (flaky under load).
const ticks = [];
async function bootClub(club) {
  for (const [clear, id] of ticks.splice(0)) clear(id);
  for (const [target, type, fn] of bound.splice(0)) {
    if (type === 'DOMContentLoaded' || type === 'hashchange') target.removeEventListener(type, fn);
  }
  jest.resetModules();
  document.body.innerHTML = body('club.html');
  window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
  global.fetch = jest.fn(() => ok(club));
  window.EscapeUtils = require('../js/escape-utils.js');
  require('../js/platform-shell.js');
  require('../js/club-policy.js'); require('../js/club-kit.js');
  require('../js/club.js');
  const setI = window.setInterval;
  const clearI = window.clearInterval;
  window.setInterval = (...args) => { const id = setI(...args); ticks.push([clearI, id]); return id; };
  try { document.dispatchEvent(new Event('DOMContentLoaded')); } finally { window.setInterval = setI; }
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
    expect(document.getElementById('cb-gate-name').textContent).toBe('<i>Caro</i>');
    expect(document.getElementById('cb-manage').hidden).toBe(true);
    expect(document.getElementById('cb-gate').hidden).toBe(false);
    expect(document.getElementById('cb-chat').hidden).toBe(true);
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

  it('pending requester sees the note + cancel in the gate (no join, no leave); cancel POSTs /leave without confirm', async () => {
    await bootClub({ ...CLUB, myRole: 'pending' });
    expect(document.getElementById('cb-join').hidden).toBe(true);
    expect(document.getElementById('cb-leave').hidden).toBe(true);
    expect(document.getElementById('cb-pending-note').hidden).toBe(false);
    expect(document.getElementById('cb-cancel').hidden).toBe(false);
    window.confirm = jest.fn(() => false);
    global.fetch.mockClear();
    document.getElementById('cb-cancel').click();
    await flush();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(global.fetch.mock.calls[0][0]).toBe('/api/clubs/caro/leave');
  });

  it('members get a leave button in their row; the owner never does', async () => {
    const lb = (role) => CLUB.leaderboard.map((m) => ({ ...m, mine: m.role === role }));
    await bootClub({ ...CLUB, myRole: 'member', leaderboard: lb('member') });
    expect(document.getElementById('cb-me').hidden).toBe(false);
    expect(document.getElementById('cb-me-name').textContent).toBe('Mem');
    expect(document.getElementById('cb-leave').hidden).toBe(false);
    await bootClub({ ...CLUB, myRole: 'owner', leaderboard: lb('owner') });
    expect(document.getElementById('cb-me').hidden).toBe(false);
    expect(document.getElementById('cb-leave').hidden).toBe(true);
  });

  describe('channels (#446, were tabs #200)', () => {
    const PUBLIC = ['chat', 'events', 'tournaments', 'board', 'members'];
    const ALL = [...PUBLIC, 'requests', 'settings', 'log'];
    const shown = () => ALL.filter((n) => !document.getElementById('cb-panel-' + n).hidden);
    const current = () => ALL.filter((n) => document.getElementById('cb-ch-' + n).getAttribute('aria-current') === 'true');
    const click = (n) => document.getElementById('cb-ch-' + n).click();

    beforeEach(() => { location.hash = ''; });

    it('opens on trò-chuyện; exactly one panel shown and one channel current; header names it', async () => {
      await bootClub(CLUB);
      expect(shown()).toEqual(['chat']);
      expect(current()).toEqual(['chat']);
      expect(document.getElementById('cb-head-title').textContent).toBe('clubs.ch_chat');
      expect(document.getElementById('cb-head-sub').textContent).toBe('clubs.chsub_chat');
    });

    it('clicking a channel swaps the panel and writes #ch=; reload restores it', async () => {
      await bootClub(CLUB);
      click('board');
      expect(shown()).toEqual(['board']);
      expect(document.getElementById('cb-app').dataset.ch).toBe('board');
      expect(location.hash).toBe('#ch=board');
      expect(document.getElementById('cb-head-title').textContent).toBe('clubs.ch_board');
      await bootClub(CLUB);
      expect(shown()).toEqual(['board']);
      expect(current()).toEqual(['board']);
    });

    it('#451: under <base href="/"> the channel hash stays on /c/<slug> (reload/share keeps the club)', async () => {
      const base = document.head.appendChild(document.createElement('base'));
      base.href = '/';
      try {
        await bootClub(CLUB);
        click('board');
        expect(location.pathname).toBe('/c/caro');
        expect(location.hash).toBe('#ch=board');
      } finally { base.remove(); }
    });

    it('legacy #tab= links still land: overview → chat, members → members, manage → requests (staff only); #ch=requests too', async () => {
      for (const [hash, role, want] of [['#tab=overview', null, 'chat'], ['#tab=members', null, 'members'], ['#tab=manage', null, 'chat'], ['#tab=manage', 'officer', 'requests'], ['#ch=requests', 'owner', 'requests'], ['#tab=nope', null, 'chat']]) {
        location.hash = hash;
        await bootClub({ ...CLUB, myRole: role });
        expect(shown()).toEqual([want]);
      }
    });

    it('staff channels exist for owner/officer only; #ch=settings for others falls back to chat', async () => {
      for (const role of [null, 'pending', 'member']) {
        location.hash = '#ch=settings';
        await bootClub({ ...CLUB, myRole: role });
        expect(['requests', 'settings', 'log'].map((n) => document.getElementById('cb-ch-' + n).hidden)).toEqual([true, true, true]);
        expect(document.getElementById('cb-staff-grp').hidden).toBe(true);
        expect(shown()).toEqual(['chat']);
      }
      location.hash = '';
      await bootClub({ ...CLUB, myRole: 'officer', pending: [{ username: 'p', displayName: 'P' }, { username: 'q', displayName: 'Q' }] });
      expect(['requests', 'settings', 'log'].map((n) => document.getElementById('cb-ch-' + n).hidden)).toEqual([false, false, false]);
      expect(document.getElementById('cb-pending-count').hidden).toBe(false);
      expect(document.getElementById('cb-pending-count').textContent).toBe('2');
    });

    it('arrow keys move focus through the visible channels and wrap', async () => {
      await bootClub(CLUB);
      const nav = document.getElementById('cb-channels');
      document.getElementById('cb-ch-chat').focus();
      nav.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      expect(document.activeElement.id).toBe('cb-ch-events');
      document.getElementById('cb-ch-chat').focus();
      nav.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
      expect(document.activeElement.id).toBe('cb-ch-members'); // staff channels hidden for visitors
    });

    it('staff tools live in the staff channels, member management in thành-viên, ratings only in xếp-hạng', async () => {
      await bootClub({ ...CLUB, myRole: 'owner', pending: [] });
      const panel = (n) => document.getElementById('cb-panel-' + n);
      expect(panel('settings').contains(document.getElementById('cb-manage'))).toBe(true);
      expect(panel('settings').contains(document.getElementById('cb-delete'))).toBe(true);
      expect(panel('requests').contains(document.getElementById('cb-pending'))).toBe(true);
      expect(panel('requests').contains(document.getElementById('cb-invite-form'))).toBe(true);
      expect(panel('log').contains(document.getElementById('cb-history'))).toBe(true);
      expect(panel('events').contains(document.getElementById('cb-event-new'))).toBe(true); // B480: opens the sheet
      expect(document.getElementById('cb-event-form').closest('dialog').id).toBe('cb-event-editor');
      expect(panel('events').contains(document.getElementById('cb-event-editor'))).toBe(false); // a hidden panel would hide it
      expect(panel('members').querySelectorAll('button').length).toBeGreaterThan(0);
      expect(panel('board').querySelectorAll('tbody button')).toHaveLength(0);
    });

    it('a reload of the data (e.g. after kick) keeps the current channel', async () => {
      await bootClub({ ...CLUB, myRole: 'owner' });
      click('members');
      document.getElementById('cb-form').onsubmit(new Event('submit'));
      await flush(); await flush();
      expect(shown()).toEqual(['members']);
    });

    it('action errors show in the centre status line', async () => {
      await bootClub({ ...CLUB, myRole: 'member' });
      global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 409, json: async () => ({ code: 'CLUB_X', error: 'Không rời được.' }) }));
      window.confirm = () => true;
      document.getElementById('cb-leave').click();
      await flush(); await flush();
      expect(document.getElementById('cb-msg').textContent).toBe('Không rời được.');
      expect(document.getElementById('cb-msg').closest('.cl-mid')).not.toBeNull();
    });
  });

  describe('members pane (#446: role groups, no presence API yet)', () => {
    const LB = [
      { rank: 1, username: 'own', displayName: 'Own', role: 'owner', rating: 1600, games: 30 },
      { rank: 2, username: 'off', displayName: 'Off', role: 'officer', rating: 1550, games: 30 },
      { rank: 3, username: 'mem', displayName: '<b>Mem</b>', role: 'member', rating: 1500, games: 30 },
      { rank: 4, username: 'new', displayName: 'New', role: 'member', rating: null, games: 0 },
    ];
    const names = (id) => [...document.querySelectorAll('#' + id + ' .cl-u b')].map((b) => b.textContent);

    it('groups Ban quản trị then Thành viên with counts, rows link to profiles, names stay text', async () => {
      await bootClub({ ...CLUB, members: 4, leaderboard: LB });
      expect(names('cb-staff')).toEqual(['Own', 'Off']);
      expect(names('cb-plain')).toEqual(['<b>Mem</b>', 'New']);
      expect(document.querySelector('#cb-plain b b')).toBeNull();
      expect(document.getElementById('cb-staff-n').textContent).toBe('2');
      expect(document.getElementById('cb-plain-n').textContent).toBe('2');
      expect([...document.querySelectorAll('#cb-plain .cl-u small')].map((x) => x.textContent)).toEqual(['clubs.rating_n{"n":1500}', 'clubs.unrated']);
      expect(document.querySelector('#cb-staff .cl-u a').getAttribute('href')).toBe('/u/own');
      expect(document.getElementById('cb-mem-pending').hidden).toBe(true);
    });

    it('staff see Chờ duyệt on top with approve/reject; visitors and members never do', async () => {
      const pending = [{ username: 'p q', displayName: 'P' }];
      for (const role of [null, 'member']) {
        await bootClub({ ...CLUB, myRole: role, pending });
        expect(document.getElementById('cb-mem-pending').hidden).toBe(true);
      }
      await bootClub({ ...CLUB, myRole: 'officer', pending });
      expect(document.getElementById('cb-mem-pending').hidden).toBe(false);
      const btns = document.querySelectorAll('#cb-mem-pending-list button');
      expect([...btns].map((b) => b.getAttribute('aria-label'))).toEqual(['clubs.approve', 'clubs.reject']);
      global.fetch.mockClear();
      btns[0].click();
      await flush();
      expect(global.fetch.mock.calls[0][0]).toBe('/api/clubs/caro/members/p%20q/approve');
      expect(global.fetch.mock.calls[0][1].method).toBe('POST');
      global.fetch.mockClear();
      btns[1].click();
      await flush();
      expect(global.fetch.mock.calls[0][0]).toBe('/api/clubs/caro/members/p%20q');
      expect(global.fetch.mock.calls[0][1].method).toBe('DELETE');
    });

    it('a big club shows the first 50 plain members and a button to the thành-viên channel', async () => {
      const many = Array.from({ length: 60 }, (_, k) => ({ rank: k + 2, username: 'u' + k, displayName: 'U' + k, role: 'member', rating: null, games: 0 }));
      await bootClub({ ...CLUB, leaderboard: [LB[0], ...many] });
      expect(document.querySelectorAll('#cb-plain .cl-u')).toHaveLength(50);
      const more = document.getElementById('cb-mem-more');
      expect(more.hidden).toBe(false);
      more.click();
      expect(document.getElementById('cb-panel-members').hidden).toBe(false);
    });
  });

  describe('rail (#446)', () => {
    it('signed out: no /mine request; the rail shows this club (active) and Khám phá, no Tạo nhóm', async () => {
      localStorage.removeItem('gvn_user');
      await bootClub({ ...CLUB, color: 'red', tag: 'HN' });
      expect(global.fetch.mock.calls.some(([u]) => String(u).includes('/mine'))).toBe(false);
      const clubs = document.querySelectorAll('#cb-rail .cl-rail__club');
      expect(clubs).toHaveLength(1);
      expect(clubs[0].getAttribute('aria-current')).toBe('page');
      expect(clubs[0].getAttribute('aria-label')).toBe('<i>Caro</i>');
      expect(clubs[0].textContent).toBe('HN');
      expect(document.querySelector('#cb-rail a[href="/clubs.html"]')).not.toBeNull();
      expect(document.getElementById('cl-rail-create')).toBeNull();
    });

    it('signed in: detail is fetched first, then /mine; my clubs fill the rail, this one marked current', async () => {
      localStorage.setItem('gvn_user', '{"userId":1}');
      jest.resetModules();
      for (const [target, type, fn] of bound.splice(0)) {
        if (type === 'DOMContentLoaded' || type === 'hashchange') target.removeEventListener(type, fn);
      }
      document.body.innerHTML = body('club.html');
      window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
      global.fetch = jest.fn((u) => (String(u).includes('/mine')
        ? ok({ clubs: [{ slug: 'other', name: 'Other', role: 'member', members: 3, avatarUrl: null }, { slug: 'caro', name: '<i>Caro</i>', role: 'member', members: 2, avatarUrl: null }] })
        : ok({ ...CLUB, myRole: 'member' })));
      require('../js/platform-shell.js'); require('../js/club-policy.js'); require('../js/club-kit.js'); require('../js/club.js');
      document.dispatchEvent(new Event('DOMContentLoaded'));
      await flush(); await flush(); await flush();
      expect(global.fetch.mock.calls[0][0]).toContain('/api/clubs/caro?category=');
      expect(global.fetch.mock.calls[1][0]).toBe('/api/clubs/mine');
      const clubs = [...document.querySelectorAll('#cb-rail .cl-rail__club')];
      expect(clubs.map((a) => a.getAttribute('href'))).toEqual(['/c/other', '/c/caro']);
      expect(clubs.map((a) => a.getAttribute('aria-current'))).toEqual([null, 'page']);
      expect(document.getElementById('cl-rail-create').getAttribute('href')).toBe('/clubs.html#create');
      localStorage.removeItem('gvn_user');
    });
  });

  // sự-kiện (calendar, agenda, RSVP, staff delete, the create sheet): client/tests/club-calendar.test.js (B480).

  describe('chat (#200 slice 3)', () => {
    const MSGS = [
      { id: 7, text: 'hi &lt;b&gt;x&lt;/b&gt;', createdAt: '2026-10-10T10:00:00.000Z', mine: false, username: 'mem', displayName: 'Mem', avatarUrl: null },
      { id: 8, text: 'second', createdAt: '2026-10-10T10:01:00.000Z', mine: true, username: 'own', displayName: 'Own', avatarUrl: null },
    ];
    const tab = () => document.getElementById('cb-ch-chat');
    const log = () => document.getElementById('cb-chat-log');
    // club JSON for everything except /messages
    async function bootChat(role, msgs = MSGS) {
      await bootClub({ ...CLUB, myRole: role });
      global.fetch = jest.fn((url, opts) => (String(url).includes('/messages')
        ? ok(opts && opts.method === 'POST' ? { id: 9 } : { messages: msgs })
        : ok({ ...CLUB, myRole: role })));
    }

    beforeEach(() => { location.hash = ''; });

    it('non-members/pending get the gate over a skeleton and no /messages request, ever', async () => {
      for (const role of [null, 'pending']) {
        location.hash = '#ch=chat';
        await bootClub({ ...CLUB, myRole: role });
        expect(document.getElementById('cb-panel-chat').hidden).toBe(false);
        expect(document.getElementById('cb-gate').hidden).toBe(false);
        expect(document.getElementById('cb-chat').hidden).toBe(true);
        expect(document.querySelector('.cl-skel').getAttribute('aria-hidden')).toBe('true');
        tab().click();
        await flush();
        expect(global.fetch.mock.calls.some(([u]) => String(u).includes('/messages'))).toBe(false);
        expect(document.querySelectorAll('#cb-chat-log > *')).toHaveLength(0);
      }
    });

    it('members get the stream; opening it loads messages once, rendered as decoded text', async () => {
      await bootChat('member');
      expect(document.getElementById('cb-gate').hidden).toBe(true);
      expect(document.getElementById('cb-chat').hidden).toBe(false);
      document.getElementById('cb-ch-events').click();
      tab().click();
      await flush(); await flush();
      expect(global.fetch.mock.calls.filter(([u]) => String(u).includes('/messages'))).toHaveLength(1);
      expect([...document.querySelectorAll('.cb-chat__text')].map((n) => n.textContent)).toEqual(['hi <b>x</b>', 'second']);
      expect(log().querySelector('b')).toBeNull();
      // B476: report on the other's row; delete only on my own (a member outranks nobody)
      expect(document.querySelectorAll('.cb-tools [data-act="report"]')).toHaveLength(1);
      expect([...document.querySelectorAll('.cb-tools [data-act="delete"]')].map((b) => b.closest('.cb-chat__msg').dataset.id)).toEqual(['8']);
      document.getElementById('cb-ch-members').click();
      tab().click();
      await flush();
      expect(global.fetch.mock.calls.filter(([u]) => String(u).includes('/messages'))).toHaveLength(1);
    });

    it('author role shows for owner/officer only; one day separator per local day', async () => {
      const msgs = [
        { ...MSGS[0], id: 1, username: 'own', displayName: 'Own', createdAt: '2026-10-09T10:00:00.000Z' },
        { ...MSGS[0], id: 2, username: 'mem', displayName: 'Mem', createdAt: '2026-10-10T10:00:00.000Z' },
        { ...MSGS[0], id: 3, username: 'mem', displayName: 'Mem', createdAt: '2026-10-10T10:05:00.000Z' },
      ];
      await bootChat('member', msgs);
      document.getElementById('cb-ch-events').click();
      tab().click();
      await flush(); await flush();
      const rows = [...document.querySelectorAll('.cb-chat__msg')];
      expect(rows.map((r) => (r.querySelector('.cl-role') || {}).textContent)).toEqual(['clubs.role_owner', undefined, undefined]);
      expect(document.querySelectorAll('#cb-chat-log .cl-day')).toHaveLength(2);
      expect(log().firstElementChild.classList.contains('cl-day')).toBe(true);
      expect(rows[0].querySelector('a.cb-chat__name').getAttribute('href')).toBe('/u/own');
    });

    it('B476: staff delete only rows they outrank; the dialog names the author, then DELETE removes the row in place', async () => {
      const msgs = [MSGS[0], { ...MSGS[1], mine: false }]; // 7 by mem (member), 8 by own (owner)
      await bootChat('officer', msgs);
      document.getElementById('cb-ch-events').click();
      tab().click();
      await flush(); await flush();
      expect([...document.querySelectorAll('.cb-tools [data-act="delete"]')].map((b) => b.closest('.cb-chat__msg').dataset.id)).toEqual(['7']);
      const dlg = document.getElementById('cb-dlg-delete');
      dlg.showModal = jest.fn(() => dlg.setAttribute('open', ''));
      dlg.close = jest.fn(() => { dlg.removeAttribute('open'); dlg.dispatchEvent(new Event('close')); });
      window.confirm = jest.fn(() => true);
      global.fetch.mockClear();
      document.querySelector('.cb-tools [data-act="delete"]').click();
      expect(dlg.showModal).toHaveBeenCalled();
      expect(document.getElementById('cb-dlg-delete-h').textContent).toBe('clubs.delete_title_other{"name":"Mem"}');
      expect(document.getElementById('cb-dlg-delete-warn').textContent).toBe('clubs.delete_warn_staff');
      expect(document.activeElement.id).toBe('cb-dlg-delete-cancel');
      expect(global.fetch).not.toHaveBeenCalled();
      document.getElementById('cb-dlg-delete-ok').click();
      await flush(); await flush();
      expect(window.confirm).not.toHaveBeenCalled();
      expect(global.fetch.mock.calls[0][0]).toBe('/api/clubs/caro/messages/7');
      expect(global.fetch.mock.calls[0][1].method).toBe('DELETE');
      expect(global.fetch.mock.calls).toHaveLength(1); // no full reload of the stream
      expect([...document.querySelectorAll('.cb-chat__msg')].map((r) => r.dataset.id)).toEqual(['8']);
      expect(document.activeElement.id).toBe('cb-chat-input');
    });

    it('row actions float out of the grid: avatar | body | one toolbar with one tab stop (no implicit 2nd grid row)', async () => {
      await bootChat('officer');
      document.getElementById('cb-ch-events').click();
      tab().click();
      await flush(); await flush();
      const rows = [...document.querySelectorAll('.cb-chat__msg')];
      for (const r of rows) {
        expect(r.children.length).toBe(3);
        expect(r.lastElementChild.getAttribute('role')).toBe('toolbar');
        expect([...r.lastElementChild.querySelectorAll('button')].filter((b) => b.tabIndex === 0)).toHaveLength(1);
      }
      const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'club.css'), 'utf8');
      expect(css).toMatch(/\.cb-chat__msg \{ position: relative; display: grid; grid-template-columns: 40px minmax\(0, 1fr\);/);
      expect(css).toMatch(/\.cb-tools \{ position: absolute;/);
      expect(css).not.toMatch(/cb-chat__acts|cb-chat__flag|cb-chat__del/); // the always-visible touch flag/trash is gone
    });

    it('poll button is an icon tool after the input, labelled for AT, not a text pill before it', async () => {
      await bootChat('member');
      const btn = document.getElementById('cb-poll-new');
      const box = btn.parentElement;
      expect([...box.children].map((n) => n.id || n.type)).toEqual(['cb-chat-input', 'cb-poll-new', 'cb-chat-send']);
      expect(btn.classList.contains('cl-ib')).toBe(true);
      expect(btn.getAttribute('data-i18n')).toBeNull();
      expect(btn.getAttribute('data-i18n-aria')).toBe('clubs.new_poll');
      expect(btn.querySelector('svg use').getAttribute('href')).toMatch(/#ph-regular-check-square$/);
    });

    it('send posts {text}, clears the input, then fetches only newer messages', async () => {
      await bootChat('member');
      document.getElementById('cb-ch-events').click();
      tab().click();
      await flush(); await flush();
      global.fetch.mockClear();
      document.getElementById('cb-chat-input').value = '  xin chào ';
      document.getElementById('cb-chat-form').onsubmit(new Event('submit'));
      await flush(); await flush(); await flush();
      const [post, poll] = global.fetch.mock.calls;
      expect(post[0]).toBe('/api/clubs/caro/messages');
      expect(JSON.parse(post[1].body)).toEqual({ text: 'xin chào' });
      expect(poll[0]).toBe('/api/clubs/caro/messages?after=8&visible=7,8');
      expect(document.getElementById('cb-chat-input').value).toBe('');
    });

    it('empty chat shows the empty note; a full page offers older messages', async () => {
      await bootChat('member', []);
      document.getElementById('cb-ch-events').click();
      tab().click();
      await flush(); await flush();
      expect(document.getElementById('cb-chat-empty').hidden).toBe(false);
      expect(document.getElementById('cb-chat-older').hidden).toBe(true);
      const full = Array.from({ length: 50 }, (_, k) => ({ ...MSGS[0], id: 100 + k }));
      await bootChat('member', full);
      document.getElementById('cb-ch-events').click();
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
      // ticket-rows.md: one span per fact, never a joined "a · b · c" string
      const seg = [...rows[0].querySelectorAll('.prow__meta > span')].map((x) => x.textContent);
      expect(seg).toHaveLength(3);
      expect(seg.slice(0, 2)).toEqual(['clubs.tstatus_draft', '3 clubs.tplayers']);
      expect(rows[0].textContent).not.toContain('·');
      expect(document.getElementById('cb-tournaments').classList.contains('prows--tickets')).toBe(true);
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

describe('club upgrade (#235)', () => {
  const FULL = {
    ...CLUB, color: 'red', tag: 'HN', announcement: 'Họp tối nay', invited: false, myRole: 'owner',
    leaderboard: [
      { rank: 1, username: 'own', displayName: 'Own', role: 'owner', rating: 1600, games: 30, mine: true },
      { rank: 2, username: 'mem', displayName: 'Mem', role: 'member', rating: null, games: 0, mine: false },
    ],
    weekly: [{ rank: 1, username: 'mem', displayName: 'Mem', avatarUrl: null, wins: 4, played: 6 }],
    invites: [{ username: 'zed', displayName: 'Zed' }],
    history: [{ id: 2, type: 'role', detail: 'officer', at: '2026-10-12T10:00:00.000Z', actor: { username: 'own', displayName: 'Own' }, target: { username: 'mem', displayName: 'Mem' } }],
    pending: [],
  };
  beforeEach(() => { location.hash = ''; sessionStorage.clear(); });
  const posts = () => global.fetch.mock.calls.filter(([, o]) => o && o.method);

  it('avatar shows the tag on the chosen colour; list rows too', async () => {
    await bootClub(FULL);
    const av = document.getElementById('cb-avatar');
    expect(av.textContent).toBe('HN');
    expect(av.classList.contains('pav--c-red')).toBe(true);
  });

  it('announcement panel only when set; invited visitor sees "accept invite"', async () => {
    await bootClub(FULL);
    expect(document.getElementById('cb-announce').hidden).toBe(false);
    expect(document.getElementById('cb-announce-text').textContent).toBe('Họp tối nay');
    await bootClub({ ...FULL, announcement: '', myRole: null, invited: true });
    expect(document.getElementById('cb-announce').hidden).toBe(true);
    expect(document.getElementById('cb-join').textContent).toBe('clubs.accept_invite');
  });

  it('staff saves announcement/tag/colour with the form; colour swatches are a radiogroup', async () => {
    await bootClub(FULL);
    expect(document.getElementById('cb-announce-input').value).toBe('Họp tối nay');
    expect(document.getElementById('cb-tag-input').value).toBe('HN');
    const sw = [...document.querySelectorAll('#cb-colors [role=radio]')];
    expect(sw).toHaveLength(8);
    expect(sw.filter((b) => b.getAttribute('aria-checked') === 'true')).toHaveLength(1);
    sw[4].click(); // purple
    document.getElementById('cb-tag-input').value = 'ab';
    document.getElementById('cb-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    const put = posts().find(([, o]) => o.method === 'PUT');
    expect(JSON.parse(put[1].body)).toMatchObject({ color: 'purple', tag: 'ab', announcement: 'Họp tối nay' });
  });

  it('invite form posts to /invites/<username>; pending invites list has a revoke button', async () => {
    await bootClub(FULL);
    expect(document.querySelectorAll('#cb-invites .prow')).toHaveLength(1);
    document.getElementById('cb-invite-name').value = 'new guy';
    document.getElementById('cb-invite-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush();
    expect(posts().some(([u, o]) => o.method === 'POST' && u.endsWith('/invites/new%20guy'))).toBe(true);
    document.querySelector('#cb-invites button').click();
    await flush();
    expect(posts().some(([u, o]) => o.method === 'DELETE' && u.endsWith('/invites/zed'))).toBe(true);
  });

  it('invite box suggests players by name; picking one fills the exact username; errors show beside the field', async () => {
    {
      await bootClub(FULL);
      const input = document.getElementById('cb-invite-name');
      global.fetch = jest.fn((u) => (String(u).includes('/api/friends/search')
        ? ok({ results: [{ username: 'nguyen_a', displayName: 'Nguyễn A' }] })
        : Promise.resolve({ ok: false, status: 404, json: async () => ({ error: 'Không tìm thấy người chơi.' }) })));
      input.value = 'Ngu';
      input.dispatchEvent(new Event('input'));
      await new Promise((r) => setTimeout(r, 320)); // debounce
      await flush();
      expect(global.fetch.mock.calls[0][0]).toContain('/api/friends/search?q=Ngu');
      const sugg = document.querySelectorAll('#cb-invite-sugg button');
      expect(sugg).toHaveLength(1);
      expect(sugg[0].textContent).toBe('Nguyễn A (@nguyen_a)');
      sugg[0].click();
      expect(input.value).toBe('nguyen_a');
      expect(document.getElementById('cb-invite-sugg').hidden).toBe(true);
      document.getElementById('cb-invite-form').dispatchEvent(new Event('submit', { cancelable: true }));
      await flush(); await flush();
      expect(document.getElementById('cb-invite-msg').textContent).toBe('Không tìm thấy người chơi.');
    }
  });

  it('history rows render as tickets: translated title + one meta span', async () => {
    await bootClub(FULL);
    const row = document.querySelector('#cb-history .prow');
    expect(row.querySelector('.prow__t').textContent).toContain('clubs.log_role');
    expect(row.querySelectorAll('.prow__meta > span')).toHaveLength(1);
  });

  it('weekly chip swaps the table: wins/played columns, rating table hidden; empty → note', async () => {
    await bootClub(FULL);
    const chips = document.querySelectorAll('#cb-tabs .pchip');
    expect(chips).toHaveLength(5);
    chips[4].click();
    expect(document.getElementById('cb-board-wrap').hidden).toBe(true);
    expect(document.getElementById('cb-weekly-wrap').hidden).toBe(false);
    expect([...document.querySelectorAll('#cb-weekly-body td')].map((x) => (x.querySelector('a') || x).textContent)).toEqual(['1', 'Mem', '4', '6']);
    expect(chips[4].getAttribute('aria-selected')).toBe('true');
    await bootClub({ ...FULL, weekly: [] });
    document.querySelectorAll('#cb-tabs .pchip')[4].click();
    expect(document.getElementById('cb-weekly-empty').hidden).toBe(false);
    expect(document.getElementById('cb-weekly-wrap').hidden).toBe(true);
  });

  it('members get a Challenge button on other members only; visitors none; click opens ChallengeModal', async () => {
    const open = jest.fn();
    window.ChallengeModal = { open };
    await bootClub(FULL);
    const rows = document.querySelectorAll('#cb-members-body tr');
    const label = (tr) => [...tr.querySelectorAll('button')].map((b) => b.textContent);
    expect(label(rows[0])).not.toContain('clubs.challenge');
    expect(label(rows[1])).toContain('clubs.challenge');
    [...rows[1].querySelectorAll('button')].find((b) => b.textContent === 'clubs.challenge').click();
    expect(open).toHaveBeenCalledWith({ to: { username: 'mem', displayName: 'Mem', avatarUrl: undefined } });
    await bootClub({ ...FULL, myRole: null });
    expect(document.getElementById('cb-actions-th').hidden).toBe(true);
    expect(document.querySelectorAll('#cb-members-body button')).toHaveLength(0);
    delete window.ChallengeModal;
  });
});

describe('club avatar + banner (#250)', () => {
  const bg = (id) => document.getElementById(id).style.backgroundImage;

  it('shows the banner and avatar images; hides the banner when there is none', async () => {
    await bootClub({ ...CLUB, avatarUrl: '/api/clubs/caro/avatar?v=3', bannerUrl: '/api/clubs/caro/banner?v=4' });
    expect(document.getElementById('cb-banner').hidden).toBe(false);
    expect(bg('cb-banner')).toContain('/api/clubs/caro/banner?v=4');
    expect(bg('cb-avatar')).toContain('/api/clubs/caro/avatar?v=3');
    await bootClub({ ...CLUB, avatarUrl: null, bannerUrl: null });
    expect(document.getElementById('cb-banner').hidden).toBe(true);
    expect(document.getElementById('cb-avatar').textContent).not.toBe('');
  });

  it('staff get a change button per image; picking a file opens the crop editor then POSTs the blob', async () => {
    const blob = { type: 'image/webp', size: 10 };
    window.AvatarCrop = { open: jest.fn(() => Promise.resolve(blob)) };
    await bootClub({ ...CLUB, myRole: 'owner', bannerUrl: '/api/clubs/caro/banner?v=4' });
    expect(document.getElementById('cb-avatar-pick')).not.toBeNull();
    const input = document.getElementById('cb-banner-file');
    const file = { name: 'b.png' };
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    global.fetch.mockClear();
    input.onchange();
    await flush(); await flush();
    expect(window.AvatarCrop.open).toHaveBeenCalledWith(file, expect.objectContaining({ aspect: 4, outWidth: 1920, titleKey: 'clubs.banner_crop_title' }));
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/clubs/caro/banner');
    expect(init).toMatchObject({ method: 'POST', body: blob });
    expect(init.headers['Content-Type']).toBe('image/webp');
    delete window.AvatarCrop;
  });

  it('cancelling the editor uploads nothing; remove only shows for an existing image and DELETEs it', async () => {
    window.AvatarCrop = { open: jest.fn(() => Promise.resolve(null)) };
    await bootClub({ ...CLUB, myRole: 'officer', avatarUrl: null, bannerUrl: '/api/clubs/caro/banner?v=4' });
    const rows = [...document.querySelectorAll('.cb-images__row')];
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelectorAll('button')).toHaveLength(1); // avatar: change only
    expect(rows[1].querySelectorAll('button')).toHaveLength(2); // banner: change + remove
    const input = document.getElementById('cb-avatar-file');
    Object.defineProperty(input, 'files', { value: [{ name: 'a.png' }], configurable: true });
    global.fetch.mockClear();
    input.onchange();
    await flush(); await flush();
    expect(global.fetch).not.toHaveBeenCalled();
    window.confirm = () => true;
    rows[1].querySelectorAll('button')[1].click();
    await flush();
    expect(global.fetch.mock.calls[0][0]).toBe('/api/clubs/caro/banner');
    expect(global.fetch.mock.calls[0][1].method).toBe('DELETE');
    delete window.AvatarCrop;
  });

  it('plain members never get the controls', async () => {
    await bootClub({ ...CLUB, myRole: 'member' });
    expect(document.getElementById('cb-manage').hidden).toBe(true);
  });
});

describe('club colour swatches are painted (fix: Manage "Màu" swatches were grey)', () => {
  it('every swatch class has a .pswatch.pav--c-* background rule in platform.css', async () => {
    await bootClub({ ...CLUB, myRole: 'owner' });
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'platform.css'), 'utf8');
    const swatches = [...document.querySelectorAll('#cb-colors .pswatch')];
    expect(swatches.length).toBeGreaterThanOrEqual(8);
    for (const b of swatches) {
      const key = [...b.classList].find((c) => c.startsWith('pav--c-'));
      expect(css).toMatch(new RegExp(`\\.pswatch\\.${key}\\b[^{]*\\{[^}]*background-color: var\\(--club-`));
    }
  });
  it('swatches opt out of forced-colors repainting (Firefox showed them ButtonFace grey)', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'platform.css'), 'utf8');
    expect(css).toMatch(/\.pswatch \{[^}]*forced-color-adjust: none/);
  });
});

describe('club banner (#446): generated pattern when none; phone keeps a short strip', () => {
  it('no banner → a seeded stone-pattern SVG on the club colour, same for the same slug; a banner hides it', async () => {
    await bootClub({ ...CLUB, color: 'teal', bannerUrl: null });
    const gen = document.getElementById('cb-banner-gen');
    expect(gen.hidden).toBe(false);
    const svg = gen.querySelector('svg.cl-genb');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.style.getPropertyValue('--cc')).toBe('var(--club-teal)');
    const first = svg.innerHTML;
    await bootClub({ ...CLUB, color: 'teal', bannerUrl: null });
    expect(document.querySelector('#cb-banner-gen svg').innerHTML).toBe(first);
    await bootClub({ ...CLUB, bannerUrl: '/api/clubs/caro/banner?v=4' });
    expect(document.getElementById('cb-banner-gen').hidden).toBe(true);
    expect(document.getElementById('cb-banner-gen').children).toHaveLength(0);
    expect(document.getElementById('cb-name').textContent).toBe('<i>Caro</i>');
    expect(document.getElementById('cb-count').textContent).toBe('clubs.members{"n":2}');
  });

  it('the shell sets --cc from the club colour (unknown colour → blue)', async () => {
    await bootClub({ ...CLUB, color: 'purple' });
    expect(document.getElementById('cb-app').style.getPropertyValue('--cc')).toBe('var(--club-purple)');
    await bootClub({ ...CLUB, color: 'url(x)' });
    expect(document.getElementById('cb-app').style.getPropertyValue('--cc')).toBe('var(--club-blue)');
  });

  it('club.css: phone banner 72px, members pane dropped at <=1180px, shell sized to end at the tab bar', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'club.css'), 'utf8');
    expect(css).toMatch(/@media \(max-width: 1180px\) \{[^@]*\.cl-mem \{ display: none; \}/);
    const phone = css.slice(css.indexOf('@media (max-width: 860px)'));
    expect(phone).toMatch(/\.cl-banner \{ height: 72px; \}/);
    expect(phone).toMatch(/body\.pshell\.cl-body \{ padding-bottom: 0; \}/);
    expect(phone).toMatch(/height: calc\(100dvh - var\(--cl-nav-h\) - var\(--ptabbar-h\) - env\(safe-area-inset-bottom\)\)/);
    expect(css).toMatch(/prefers-reduced-motion: reduce\) \{\s*\.cl-hq \*[^}]*animation: none !important/);
    // thành-viên is the only role/kick UI below 1180px: on phones each member is a card, actions wrap below (no offscreen buttons)
    expect(phone).toMatch(/#cb-members-body tr \{ display: grid;/);
    expect(phone).toMatch(/#cb-members-body td:nth-child\(3\) \{ grid-column: 1 \/ -1; display: flex; flex-wrap: wrap;/);
  });
});

describe('chat commands + notifications (B447)', () => {
  const DEFAULTS = { cmdPin: true, cmdChallenge: true, cmdPoll: true, cmdCalendar: true, notifyMention: true, notifyAll: false, notifyPin: false, notifyPoll: false, remindEvents: true, unreadDot: true };
  const LB = [
    { rank: 1, username: 'own', displayName: 'Own', role: 'owner', rating: 1600, games: 30 },
    { rank: 2, username: 'mem', displayName: 'Mem', role: 'member', rating: null, games: 0 },
  ];
  const clubAs = (role, extra = {}) => ({
    ...CLUB, myRole: role, chat: DEFAULTS, lastMessageId: 0,
    leaderboard: LB.map((x) => ({ ...x, mine: x.username === (role === 'member' ? 'mem' : 'own') })),
    ...extra,
  });
  const input = () => document.getElementById('cb-chat-input');
  const hints = () => [...document.querySelectorAll('#cb-chat-hints .cl-hint b')].map((b) => b.textContent);
  const type = (v) => { input().value = v; input().dispatchEvent(new Event('input')); };
  const key = (k) => input().dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }));
  const dot = () => document.getElementById('cb-chat-unread');

  async function boot(club, msgs = []) {
    await bootClub(club);
    global.fetch = jest.fn((url, opts) => (String(url).includes('/messages')
      ? ok(opts && opts.method === 'POST' ? { id: 99 } : { messages: typeof msgs === 'function' ? msgs(String(url)) : msgs })
      : ok(club)));
  }

  beforeEach(() => { location.hash = ''; localStorage.clear(); });

  describe('composer hints', () => {
    it('"/" lists only enabled commands this member may use; /ghim is staff-only', async () => {
      await boot(clubAs('member'));
      type('/');
      expect(hints()).toEqual(['/binhchon', '/lich', '/giaohuu']);
      expect(document.getElementById('cb-chat-hints').hidden).toBe(false);
      expect(input().getAttribute('aria-expanded')).toBe('true');
      await boot(clubAs('officer'));
      type('/');
      expect(hints()).toEqual(['/binhchon', '/lich', '/giaohuu', '/ghim']);
      type('/b');
      expect(hints()).toEqual(['/binhchon']);
      type('/gh');
      expect(hints()).toEqual(['/ghim']);
    });

    it('disabled commands are not offered; no hints once a space is typed or for plain text', async () => {
      await boot(clubAs('owner', { chat: { ...DEFAULTS, cmdChallenge: false, cmdPoll: false, cmdCalendar: false } }));
      type('/');
      expect(hints()).toEqual(['/ghim']);
      type('/ghim hello');
      expect(document.getElementById('cb-chat-hints').hidden).toBe(true);
      type('hello /');
      expect(document.getElementById('cb-chat-hints').hidden).toBe(true);
      await boot(clubAs('owner', { chat: { ...DEFAULTS, cmdPin: false, cmdChallenge: false, cmdPoll: false, cmdCalendar: false } }));
      type('/pin');
      expect(document.getElementById('cb-chat-hints').hidden).toBe(true);
      for (const gone of ['/help', '/trogiup', '/mute', '/duoi']) { // B477: retired words are not offered
        type(gone);
        expect(document.getElementById('cb-chat-hints').hidden).toBe(true);
      }
    });

    it('arrows move the selection, Enter fills the command (no submit), Escape closes', async () => {
      await boot(clubAs('owner'));
      type('/');
      key('ArrowDown');
      expect(document.querySelector('#cb-chat-hints [aria-selected="true"] b').textContent).toBe('/lich');
      expect(input().getAttribute('aria-activedescendant')).toBe('cb-hint-1');
      key('Enter');
      expect(input().value).toBe('/lich ');
      expect(document.getElementById('cb-chat-hints').hidden).toBe(true);
      expect(global.fetch.mock.calls.some(([, o]) => o && o.method === 'POST')).toBe(false);
      type('/');
      key('Escape');
      expect(document.getElementById('cb-chat-hints').hidden).toBe(true);
    });

    it('keys during IME composition are left alone', async () => {
      await boot(clubAs('owner'));
      type('/');
      const ev = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, isComposing: true });
      input().dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false);
      expect(input().value).toBe('/');
      expect(document.getElementById('cb-chat-hints').hidden).toBe(false);
    });
  });

  describe('poll sheet (B479)', () => {
    const $ = (id) => document.getElementById(id);
    const inputs = () => [...document.querySelectorAll('#cb-options input')];
    const values = () => inputs().map((i) => i.value);
    const btn = (row, move) => document.querySelectorAll('#cb-options .cb-opt')[row].querySelector(`[data-move="${move}"]`);
    const disabled = (move) => inputs().map((_, i) => btn(i, move).disabled);
    const errs = () => [...document.querySelectorAll('#cb-options .cb-opt__err')].map((p) => p.textContent);
    const fill = (q, ...opts) => {
      $('cb-question').value = q;
      opts.forEach((v, i) => { if (!inputs()[i]) $('cb-add-option').onclick(); inputs()[i].value = v; });
      $('cb-poll-form').oninput();
    };
    const publish = async () => { await $('cb-poll-form').onsubmit(new Event('submit')); await flush(); };
    const posts = () => global.fetch.mock.calls.filter(([, o]) => o?.method === 'POST');

    async function open() {
      await boot(clubAs('member'));
      $('cb-poll-editor').showModal = jest.fn();
      $('cb-poll-editor').close = jest.fn();
      $('cb-poll-new').onclick();
    }

    it('adds, removes and reorders by buttons; ends and the 2-option floor are disabled', async () => {
      await open();
      expect(disabled('up')).toEqual([true, false]);
      expect(disabled('down')).toEqual([false, true]);
      expect(disabled('remove')).toEqual([true, true]);
      fill('Q', 'A', 'B', 'C');
      expect($('cb-options-n').textContent).toBe('3/6');
      expect(disabled('remove')).toEqual([false, false, false]);
      btn(2, 'up').click();
      expect(values()).toEqual(['A', 'C', 'B']);
      btn(0, 'down').click();
      expect(values()).toEqual(['C', 'A', 'B']);
      expect([...document.querySelectorAll('.cb-opt__n')].map((n) => n.textContent)).toEqual(['1', '2', '3']);
      btn(1, 'remove').click();
      expect(values()).toEqual(['C', 'B']);
      expect(disabled('remove')).toEqual([true, true]);
      for (let i = 0; i < 4; i += 1) $('cb-add-option').onclick();
      expect(inputs()).toHaveLength(6);
      expect($('cb-add-option').disabled).toBe(true);
    });

    it('Enter in the last option adds the next one, never publishes', async () => {
      await open();
      const enter = (i) => { const ev = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }); inputs()[i].onkeydown(ev); return ev; };
      expect(enter(0).defaultPrevented).toBe(true);
      expect(inputs()).toHaveLength(2);
      expect(document.activeElement).toBe(inputs()[1]);
      enter(1);
      expect(inputs()).toHaveLength(3);
      expect(document.activeElement).toBe(inputs()[2]);
    });

    it('failed submit: summary links, every empty field marked, first one focused, nothing sent', async () => {
      await open();
      expect($('cb-poll-summary').hidden).toBe(true);
      expect(errs()).toEqual(['', '']);
      await publish();
      expect(posts()).toHaveLength(0);
      expect($('cb-poll-summary').hidden).toBe(false);
      expect($('cb-poll-summary').querySelectorAll('a')).toHaveLength(3);
      expect($('cb-question-err').textContent).toBe('clubs.poll_err_usage_question{"max":140}');
      expect(errs()[0]).toContain('clubs.poll_err_usage_option');
      expect(document.activeElement).toBe($('cb-question'));
      $('cb-poll-summary').querySelectorAll('a')[2].click();
      expect(document.activeElement).toBe(inputs()[1]);
      const shown = $('cb-poll-summary').firstChild;
      $('cb-poll-form').oninput();
      expect($('cb-poll-summary').firstChild).toBe(shown); // unchanged errors are not re-announced
      fill('Q', 'A', 'B');
      expect($('cb-poll-summary').hidden).toBe(true);
    });

    it('duplicate (folded like the server) shows while typing and outlines both rows', async () => {
      await open();
      fill('Q', 'Tự do', 'x', ' tự DO ');
      expect(inputs().map((i) => i.getAttribute('aria-invalid'))).toEqual(['true', 'false', 'true']);
      expect(errs()).toEqual(['', '', 'clubs.poll_err_duplicate{"n":1,"max":50}']);
      fill('Q', 'Tự do', 'x', 'Tu do'); // diacritics are not stripped
      expect(errs()).toEqual(['', '', '']);
    });

    it('slash prefill past the limits keeps every part and flags too_long and too_many', async () => {
      await boot(clubAs('member'));
      $('cb-poll-editor').showModal = jest.fn();
      input().value = '/binhchon  Ăn   gì | ' + 'a'.repeat(51) + ' |  | b | c | d | e | f | g';
      $('cb-chat-form').onsubmit(new Event('submit'));
      await flush();
      expect($('cb-question').value).toBe('Ăn gì');
      expect(values()).toEqual(['a'.repeat(51), 'b', 'c', 'd', 'e', 'f', 'g']);
      expect(errs()[0]).toContain('clubs.poll_err_long_option');
      expect(errs()[6]).toContain('clubs.poll_err_too_many');
      expect(btn(6, 'remove').disabled).toBe(false);
      $('cb-question').value = 'q'.repeat(141);
      $('cb-poll-form').oninput();
      expect($('cb-question-err').textContent).toContain('clubs.poll_err_long_question');
    });

    it('client checks agree with server validatePoll', async () => {
      const { validatePoll } = require('../../server/managers/ClubChatCommands.js');
      await open();
      const cases = [['Q', 'A', 'B'], ['', 'A', 'B'], ['Q', 'A', ' '], ['Q', 'A', ' a'], ['Q', 'Đỏ', 'đỎ'], ['Q', 'a'.repeat(50), 'B'],
        ['Q', 'a'.repeat(51), 'B'], ['q'.repeat(140), 'A', 'B'], ['q'.repeat(141), 'A', 'B'], ['Q', '1', '2', '3', '4', '5', '6', '7']];
      for (const [q, ...opts] of cases) {
        $('cb-poll-new').onclick();
        global.fetch.mockClear();
        fill(q, ...opts.slice(0, 6));
        if (opts.length > 6) { $('cb-poll-editor').showModal = jest.fn(); input().value = ['/binhchon ' + q, ...opts].join('|'); $('cb-chat-form').onsubmit(new Event('submit')); await flush(); }
        await publish();
        expect([q, opts, posts().length > 0]).toEqual([q, opts, !validatePoll(q, opts).error]);
      }
    });

    it('preview is the real poll card: zero votes, all disabled, follows the inputs', async () => {
      await open();
      fill('Mấy giờ <?>', '20h', '');
      const prev = $('cb-poll-preview');
      expect(prev.querySelector('.cb-poll__q').textContent).toBe('Mấy giờ <?>');
      expect([...prev.querySelectorAll('.cb-poll__label')].map((n) => n.textContent)).toEqual(['20h', 'clubs.option 2']);
      expect([...prev.querySelectorAll('.cb-poll__n')].map((n) => n.textContent)).toEqual(['clubs.poll_votes{"n":0}', 'clubs.poll_votes{"n":0}']);
      expect([...prev.querySelectorAll('button')].every((b) => b.disabled)).toBe(true);
      expect(prev.querySelector('.cb-poll__link')).toBeNull();
      expect($('cb-question-n').textContent).toBe('11/140');
    });

    it('the server error lands in the same summary and clears on the next edit', async () => {
      await open();
      fill('Q', 'A', 'B');
      global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({ code: 'CLUB_POLL_LIMIT', error: 'Đã đủ 3' }) }));
      await publish();
      expect($('cb-poll-summary').hidden).toBe(false);
      expect($('cb-poll-summary').textContent).toBe($('cb-msg').textContent);
      expect($('cb-poll-editor').close).not.toHaveBeenCalled();
      $('cb-poll-form').oninput();
      expect($('cb-poll-summary').hidden).toBe(true);
    });
  });

  describe('retired and alias commands (B477)', () => {
    const submit = async (text) => {
      input().value = text;
      document.getElementById('cb-chat-form').onsubmit(new Event('submit'));
      await flush(); await flush();
    };
    const posted = () => global.fetch.mock.calls.some(([, o]) => o?.method === 'POST');

    it.each(['/trogiup', '/help'])('%s opens the popup without a request', async (word) => {
      await boot(clubAs('member'));
      await submit(word);
      expect(input().value).toBe('/');
      expect(hints()).toEqual(['/binhchon', '/lich', '/giaohuu']);
      expect(posted()).toBe(false);
    });

    it('a moved command keeps the text and links to thành-viên', async () => {
      await boot(clubAs('officer'));
      global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 400, json: () => Promise.resolve({ code: 'CLUB_COMMAND_MOVED' }) }));
      await submit('/duoi @mem');
      expect(input().value).toBe('/duoi @mem');
      expect(document.querySelector('#cb-msg a').getAttribute('href')).toBe('/c/caro#ch=members'); // a bare hash would leave the club (<base href="/">)
    });

    it('/binhchon opens the poll sheet prefilled; the toggle hides the composer poll button', async () => {
      await boot(clubAs('member'));
      document.getElementById('cb-poll-editor').showModal = jest.fn();
      await submit('/binhchon Q | A | B');
      expect(document.getElementById('cb-question').value).toBe('Q');
      expect([...document.querySelectorAll('#cb-options input')].map((i) => i.value)).toEqual(['A', 'B']);
      expect(posted()).toBe(false);
      await boot(clubAs('member', { chat: { ...DEFAULTS, cmdPoll: false } }));
      expect(document.getElementById('cb-poll-new').hidden).toBe(true);
    });

    it('rows carry an icon tile, arguments, description and alias', async () => {
      await boot(clubAs('member'));
      type('/b');
      const row = document.querySelector('#cb-chat-hints [role="option"]');
      expect(row.querySelector('.cl-hint__tile .icon')).not.toBeNull();
      expect(row.querySelector('.cl-hint__args').textContent).toBe('clubs.cmd_poll_args');
      expect(row.querySelector('.cl-hint__desc').textContent).toBe('clubs.cmd_poll');
      expect(row.querySelector('.cl-hint__alias').textContent).toBe('clubs.cmd_alias /poll');
    });
  });

  describe('mention popup (B478)', () => {
    const roster = [
      { username: 'own', displayName: 'Own', role: 'owner' },
      { username: 'mem', displayName: 'Mem', role: 'member' },
      { username: 'anhld', displayName: 'Đức Anh', role: 'officer' },
      { username: 'maihoa92', displayName: 'Hoa Mai', role: 'member' },
      { username: 'nfd', displayName: 'Lê Hoà'.normalize('NFD'), role: 'member' },
    ];
    const open = async (extra = {}) => {
      await bootClub({ ...CLUB, myRole: 'member', chat: DEFAULTS, lastMessageId: 0, leaderboard: roster.map((x) => ({ ...x, mine: x.username === 'mem' })), ...extra });
      global.fetch = jest.fn(() => ok({ messages: [] }));
    };
    const box = () => document.getElementById('cb-chat-hints');
    const names = () => [...box().querySelectorAll('[role="option"] b')].map((b) => b.textContent.normalize('NFC'));
    const marks = () => [...box().querySelectorAll('mark')].map((m) => m.textContent.normalize('NFC'));

    it.each([
      ['@duc', ['Đức Anh'], ['Đức']],
      ['@Đức', ['Đức Anh'], ['Đức']],
      ['@anh', ['Đức Anh'], ['Anh']],
      ['@maih', ['Hoa Mai'], []],
      ['@hoa', ['Hoa Mai', 'Lê Hoà'], ['Hoa', 'Hoà']],
      ['@ow', ['Own'], ['Ow']],
    ])('%s matches display name or username, folded', async (q, expected, marked) => {
      await open();
      type(q);
      expect(names()).toEqual(expected);
      expect(marks()).toEqual(marked);
    });

    it('rows show @username and the staff role; picking inserts the username on click, not on press', async () => {
      await open();
      type('hi @duc');
      const row = box().querySelector('[role="option"]');
      expect(row.querySelector('.cl-hint__sub').textContent).toBe('@anhld');
      expect(row.querySelector('.cl-role').textContent).toBe('clubs.role_officer');
      expect(row.querySelector('.pav')).not.toBeNull();
      const press = new Event('pointerdown', { cancelable: true });
      row.dispatchEvent(press);
      expect(press.defaultPrevented).toBe(true);
      expect(input().value).toBe('hi @duc');
      row.click();
      expect(input().value).toBe('hi @anhld ');
    });

    it('labels the listbox by mode, announces the count and scrolls the active option into view', async () => {
      await open();
      const spy = jest.fn();
      window.Element.prototype.scrollIntoView = spy;
      type('@');
      expect(box().getAttribute('aria-label')).toBe('clubs.mention_list');
      expect(document.getElementById('cb-hint-count').textContent).toBe('clubs.hint_count{"n":5}'); // 4 people + officers
      key('ArrowUp');
      expect(spy.mock.contexts.at(-1).id).toBe('cb-hint-4');
      expect(spy).toHaveBeenLastCalledWith({ block: 'nearest' });
      type('/');
      expect(box().getAttribute('aria-label')).toBe('clubs.cmd_list');
      delete window.Element.prototype.scrollIntoView;
    });

    it('closes on blur at once', async () => {
      await open();
      type('@');
      input().dispatchEvent(new Event('blur'));
      expect(box().hidden).toBe(true);
    });

    it.each([
      ['@aaa @bbb @ccc @ddd', true],
      ['@aaa @bbb @ccc @ddd @eee', false],
      ['@aaa @bbb @ccc @ddd @AAA @officers @all', true],
    ])('cap hint for "%s": hidden=%s', async (text, hidden) => {
      await open();
      type(text);
      expect(document.getElementById('cb-mention-cap').hidden).toBe(hidden);
    });

    it('folds the chrome while the keyboard is open, not on pinch-zoom', async () => {
      const vv = Object.assign(new window.EventTarget(), { height: window.innerHeight, scale: 1 });
      Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
      await open();
      const at = (height, scale) => { Object.assign(vv, { height, scale }); vv.dispatchEvent(new Event('resize')); return document.getElementById('cb-app').classList.contains('is-kbd'); };
      expect(at(window.innerHeight * 0.5, 1)).toBe(true);
      expect(at(window.innerHeight, 1)).toBe(false);
      expect(at(window.innerHeight / 2, 2)).toBe(false);
      delete window.visualViewport;
    });
  });

  describe('staff toggles in cài-đặt-nhóm', () => {
    it('reflect the club settings and are saved with the form', async () => {
      await boot(clubAs('officer', { chat: { ...DEFAULTS, notifyAll: true } }));
      const boxes = Object.fromEntries([...document.querySelectorAll('#cb-chatset input[data-chat]')].map((b) => [b.dataset.chat, b]));
      expect(Object.keys(boxes).sort()).toEqual(Object.keys(DEFAULTS).sort());
      expect(boxes.notifyAll.checked).toBe(true);
      expect(boxes.notifyPin.checked).toBe(false);
      expect(boxes.cmdPin.checked).toBe(true);
      boxes.cmdPin.checked = false;
      document.getElementById('cb-form').onsubmit(new Event('submit'));
      await flush();
      const put = global.fetch.mock.calls.find(([, o]) => o && o.method === 'PUT');
      expect(JSON.parse(put[1].body).chatSettings).toEqual({ ...DEFAULTS, notifyAll: true, cmdPin: false });
    });

    it('B450: /lich hint text differs for staff (create args) and members (list only)', async () => {
      await boot(clubAs('member'));
      type('/l');
      expect(document.querySelector('#cb-chat-hints .cl-hint__desc').textContent).toBe('clubs.cmd_calendar');
      expect(document.querySelector('#cb-chat-hints .cl-hint__args').textContent).toBe('');
      await boot(clubAs('officer'));
      type('/l');
      expect(document.querySelector('#cb-chat-hints .cl-hint__desc').textContent).toBe('clubs.cmd_calendar_staff');
      expect(document.querySelector('#cb-chat-hints .cl-hint__args').textContent).toBe('clubs.cmd_calendar_args');
    });

    it('B450: Enter on a fully typed "/lich" is not swallowed by the hint (it sends); "/l" + Enter still completes', async () => {
      await boot(clubAs('member'));
      type('/l');
      key('Enter');
      expect(input().value).toBe('/lich ');
      type('/lich');
      const ev = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
      input().dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(false); // the form's submit runs
      expect(document.getElementById('cb-chat-hints').hidden).toBe(true);
      type('/binhchon'); // commands that need arguments still only fill in
      key('Enter');
      expect(input().value).toBe('/binhchon');
    });

    it('B477: a bare /lich opens sự-kiện with no chat call (only the calendar asks for its month)', async () => {
      const today = window.ClubPolicy.vnParts(Date.now());
      const evs = [{ id: 'z', title: 'Từ lệnh', startsAt: window.ClubPolicy.vnToIso({ ...today, hh: 12, mi: 0 }), going: 2, mine: false }];
      await boot(clubAs('member', { events: evs }));
      global.fetch.mockClear();
      input().value = '/lich';
      document.getElementById('cb-chat-form').onsubmit(new Event('submit'));
      await flush(); await flush();
      expect(location.hash).toBe('#ch=events');
      expect(document.getElementById('cb-panel-events').hidden).toBe(false);
      expect(document.querySelector('[data-event="z"] .cb-ev__t').textContent).toBe('Từ lệnh'); // today is selected
      expect(input().value).toBe('');
      expect(global.fetch.mock.calls.map(([u]) => String(u))).toEqual(['/api/clubs/caro/events?month=' + today.y + '-' + String(today.m).padStart(2, '0')]);
    });

    it('B450/B480: staff /lich with an argument opens the create sheet prefilled in Vietnam time, nothing posted', async () => {
      await boot(clubAs('owner'));
      const dlg = document.getElementById('cb-event-editor');
      dlg.showModal = jest.fn(() => dlg.setAttribute('open', ''));
      global.fetch.mockClear();
      input().value = '/lich 25/12 20:00 Mới';
      document.getElementById('cb-chat-form').onsubmit(new Event('submit'));
      await flush(); await flush(); await flush();
      expect(global.fetch.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(false);
      expect(location.hash).toBe('#ch=events');
      expect(dlg.showModal).toHaveBeenCalled();
      expect(document.getElementById('cb-event-title').value).toBe('Mới');
      expect(document.getElementById('cb-event-date').value).toBe(window.ClubPolicy.parseEventArg('25/12 20:00 x').startsAt.slice(0, 4) + '-12-25');
      expect(document.getElementById('cb-event-time').value).toBe('20:00');
      expect(document.getElementById('cb-event-preview').textContent).toContain('Mới');
      expect(input().value).toBe('');
    });

    it('members never see them', async () => {
      await boot(clubAs('member'));
      expect(document.getElementById('cb-manage').hidden).toBe(true);
    });
  });

  describe('stream rows', () => {
    const AT = '2026-10-10T10:00:00.000Z';
    it('/ghim and /giaohuu render as system rows: icon tile, title, decoded text or term pills, no avatar', async () => {
      await boot(clubAs('member'), [
        { id: 1, kind: 'pin', text: 'Họp &lt;8h&gt;', createdAt: AT, username: 'own', displayName: 'Own' },
        { id: 2, kind: 'challenge', text: '', createdAt: AT, username: 'mem', displayName: 'Mem', meta: { to: { username: 'own', displayName: 'Own' }, rule: 'caro', time: '3+2' } },
      ]);
      document.getElementById('cb-ch-events').click();
      document.getElementById('cb-ch-chat').click();
      await flush(); await flush();
      const rows = [...document.querySelectorAll('.cb-chat__msg--sys')];
      expect(rows).toHaveLength(2);
      expect(rows[0].querySelector('.cb-chat__tile')).not.toBeNull();
      expect(rows[0].querySelector('.cb-chat__sys-t').textContent).toContain('clubs.sys_pin{"name":"Own"}');
      expect(rows[0].querySelector('.cb-chat__text').textContent).toBe('Họp <8h>');
      expect(rows[1].querySelector('.cb-chat__sys-t').textContent).toContain('clubs.sys_challenge{"name":"Mem","to":"Own"}');
      expect([...rows[1].querySelectorAll('.cb-chat__terms .cl-count')].map((n) => n.textContent)).toEqual(['rule.caro', '3+2', 'clubs.sys_unrated']);
      expect(document.querySelector('.cb-chat__msg--sys .cl-av40')).toBeNull();
    });

    it('@member is highlighted (text nodes only); a mention of me marks the row; unknown names stay plain', async () => {
      await boot(clubAs('member'), [
        { id: 1, kind: 'text', text: 'hi @Mem and @own, mail a@own.vn @nobody &lt;b&gt;', createdAt: AT, username: 'own', displayName: 'Own', mine: false },
        { id: 2, kind: 'text', text: 'plain', createdAt: AT, username: 'own', displayName: 'Own', mine: false },
      ]);
      document.getElementById('cb-ch-events').click();
      document.getElementById('cb-ch-chat').click();
      await flush(); await flush();
      const [first, second] = document.querySelectorAll('.cb-chat__msg');
      expect([...first.querySelectorAll('.cb-chat__at')].map((n) => [n.textContent, n.classList.contains('is-me')])).toEqual([['@Mem', true], ['@own', false]]);
      expect(first.querySelector('.cb-chat__text').textContent).toBe('hi @Mem and @own, mail a@own.vn @nobody <b>');
      expect(first.querySelector('.cb-chat__text b:not(.cb-chat__at)')).toBeNull();
      expect(first.classList.contains('is-mentioned')).toBe(true);
      expect(second.classList.contains('is-mentioned')).toBe(false);
    });
    it('@all is highlighted only from staff with notifyAll on (when the server notified)', async () => {
      const at = (text, username, chat) => boot(clubAs('member', { chat }), [{ id: 1, kind: 'text', text, createdAt: AT, username, displayName: 'X', mine: false }]);
      const open = async () => { document.getElementById('cb-ch-events').click(); document.getElementById('cb-ch-chat').click(); await flush(); await flush(); };
      await at('@all họp', 'own', { ...DEFAULTS, notifyAll: true });
      await open();
      expect(document.querySelector('.cb-chat__msg').classList.contains('is-mentioned')).toBe(true);
      for (const [who, chat] of [['own', DEFAULTS], ['mem', { ...DEFAULTS, notifyAll: true }]]) {
        await at('@all họp', who, chat);
        await open();
        expect(document.querySelector('.cb-chat__at')).toBeNull();
        expect(document.querySelector('.cb-chat__msg').classList.contains('is-mentioned')).toBe(false);
      }
    });
  });

  describe('message actions (B476)', () => {
    const AT = '2026-10-10T10:00:00.000Z';
    const msg = (id, extra = {}) => ({ id, kind: 'text', text: 'tin ' + id, createdAt: AT, mine: false, username: 'mem', displayName: 'Mem', avatarUrl: null, ...extra });
    const rowEl = (id) => document.querySelector('.cb-chat__msg[data-id="' + id + '"]');
    const acts = (root) => [...root.querySelectorAll('[data-act]')].map((b) => b.dataset.act);
    const openChat = async () => { document.getElementById('cb-ch-events').click(); document.getElementById('cb-ch-chat').click(); await flush(); await flush(); };
    let coarse = false;

    beforeEach(() => {
      coarse = false;
      window.matchMedia = jest.fn((q) => ({ matches: q.includes('coarse') ? coarse : false, addEventListener() {}, removeEventListener() {} }));
      for (const proto of [window.HTMLDialogElement.prototype]) {
        proto.showModal = function () { this.setAttribute('open', ''); };
        proto.close = function () { if (!this.hasAttribute('open')) return; this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };
      }
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: jest.fn(() => Promise.resolve()) }, configurable: true });
    });

    /** GET → { messages, rev, edited } from `reply(url)`; PATCH → `patch(body)`; other writes → {ok}. */
    function stub(club, reply, patch = (b) => ({ id: 0, text: b.text, editedAt: AT })) {
      global.fetch = jest.fn((url, o = {}) => {
        const u = String(url);
        if (o.method === 'PATCH') { const r = patch(JSON.parse(o.body), u); return r.ok === false ? Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve(r) }) : ok(r); }
        if (o.method) return ok({ ok: true });
        if (u.includes('/messages')) return ok(reply(u));
        return ok(club);
      });
    }
    const gets = () => global.fetch.mock.calls.filter(([u, o]) => String(u).includes('/messages') && !(o && o.method)).map(([u]) => String(u));

    it('toolbar per role: own text = edit, delete, ⋯; others = report, ⋯; staff add delete only on rows they outrank; own poll has no edit', async () => {
      const list = [msg(1, { mine: true, username: 'mem' }), msg(2, { username: 'own', displayName: 'Own' }), msg(3, { mine: true, username: 'mem', kind: 'poll', poll: null })];
      await boot(clubAs('member'), list);
      await openChat();
      expect(acts(rowEl(1).querySelector('.cb-tools'))).toEqual(['edit', 'delete', 'more']);
      expect(acts(rowEl(2).querySelector('.cb-tools'))).toEqual(['report', 'more']);
      expect(acts(rowEl(3).querySelector('.cb-tools'))).toEqual(['delete', 'more']);
      expect(rowEl(1).querySelector('.cb-tools').getAttribute('aria-label')).toBe('clubs.msg_actions_of{"name":"Mem"}');
      const more = rowEl(2).querySelector('.cb-tools__more');
      expect(more.getAttribute('aria-haspopup')).toBe('menu');
      expect(more.querySelector('use').getAttribute('href')).toMatch(/#ph-regular-dots-three$/);

      await boot(clubAs('owner'), [msg(4)]);
      await openChat();
      expect(acts(rowEl(4).querySelector('.cb-tools'))).toEqual(['report', 'delete', 'more']);
    });

    it('toolbar is one tab stop with roving focus (Left/Right/Home/End)', async () => {
      await boot(clubAs('member'), [msg(1, { mine: true })]);
      await openChat();
      const btns = [...rowEl(1).querySelectorAll('.cb-tools button')];
      expect(btns.map((b) => b.tabIndex)).toEqual([0, -1, -1]);
      btns[0].focus();
      btns[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      expect(document.activeElement).toBe(btns[1]);
      expect(btns.map((b) => b.tabIndex)).toEqual([-1, 0, -1]);
      btns[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
      expect(document.activeElement).toBe(btns[2]);
      btns[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
      expect(document.activeElement).toBe(btns[0]);
    });

    it('desktop ⋯ opens a menu (no "select text"), Escape closes it and returns focus to ⋯', async () => {
      await boot(clubAs('member'), [msg(1, { mine: true }), msg(2)]);
      await openChat();
      const more = rowEl(1).querySelector('.cb-tools__more');
      more.click();
      const menu = rowEl(1).querySelector('.cb-menu');
      expect(menu.getAttribute('role')).toBe('menu');
      expect(acts(menu)).toEqual(['edit', 'copy', 'delete']);
      expect(more.getAttribute('aria-expanded')).toBe('true');
      expect(document.activeElement).toBe(menu.firstChild);
      menu.firstChild.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      expect(document.activeElement.dataset.act).toBe('copy');
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      expect(document.querySelector('.cb-menu')).toBeNull();
      expect(more.getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(more);
      rowEl(2).querySelector('.cb-tools__more').click();
      expect(acts(rowEl(2).querySelector('.cb-menu'))).toEqual(['copy', 'report']);
      document.body.click();
      expect(document.querySelector('.cb-menu')).toBeNull();
    });

    it('phone: long-press (450 ms) opens the sheet with preview + Sửa/Sao chép/Chọn văn bản/Xoá; moving > 8 px cancels; close returns focus to ⋯', async () => {
      jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setImmediate', 'nextTick'] });
      await boot(clubAs('member'), [msg(1, { mine: true, text: 'xin &lt;chào&gt;' }), msg(2)]);
      coarse = true;
      await openChat();
      const sheet = document.getElementById('cb-sheet-actions');
      const ptr = (type, target, x = 10, y = 10) => { const e = new Event(type, { bubbles: true }); Object.assign(e, { pointerType: 'touch', clientX: x, clientY: y }); target.dispatchEvent(e); };
      jest.useFakeTimers();
      try {
        const text = rowEl(1).querySelector('.cb-chat__text');
        ptr('pointerdown', text);
        ptr('pointermove', text, 30, 10); // a scroll-ish drag
        jest.advanceTimersByTime(500);
        expect(sheet.hasAttribute('open')).toBe(false);
        ptr('pointerdown', text);
        jest.advanceTimersByTime(449);
        expect(sheet.hasAttribute('open')).toBe(false);
        jest.advanceTimersByTime(1);
        expect(sheet.hasAttribute('open')).toBe(true);
      } finally { jest.useRealTimers(); }
      expect(rowEl(1).classList.contains('is-selected')).toBe(true);
      expect(document.querySelector('#cb-sheet-quote > div').textContent).toBe('Memxin <chào>');
      expect(acts(document.getElementById('cb-sheet-list'))).toEqual(['edit', 'copy', 'select', 'delete']);
      expect(document.activeElement).toBe(sheet); // touch: no ring on an item
      // lifting the finger after the hold clicks the backdrop: the sheet stays; a tap that starts on the backdrop closes it
      sheet.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(sheet.hasAttribute('open')).toBe(true);
      sheet.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      sheet.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(sheet.hasAttribute('open')).toBe(false);
      sheet.showModal();
      sheet.close();
      expect(rowEl(1).classList.contains('is-selected')).toBe(false);
      expect(document.activeElement).toBe(rowEl(1).querySelector('.cb-tools__more'));
      // contextmenu (Android long-press, right-click) opens the same sheet; the other's row offers report, no edit
      const ev = new Event('contextmenu', { bubbles: true, cancelable: true });
      rowEl(2).querySelector('.cb-chat__text').dispatchEvent(ev);
      expect(ev.defaultPrevented).toBe(true);
      expect(acts(document.getElementById('cb-sheet-list'))).toEqual(['copy', 'select', 'report']);
      // "Chọn văn bản" gives the row native selection back, and then its contextmenu is the browser's
      document.querySelector('#cb-sheet-list [data-act="select"]').click();
      expect(sheet.hasAttribute('open')).toBe(false);
      expect(rowEl(2).classList.contains('is-selecting')).toBe(true);
      const native = new Event('contextmenu', { bubbles: true, cancelable: true });
      rowEl(2).querySelector('.cb-chat__text').dispatchEvent(native);
      expect(native.defaultPrevented).toBe(false);
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      expect(rowEl(2).classList.contains('is-selecting')).toBe(false);
    });

    it('phone: ⋯ (keyboard / screen reader) opens the sheet focused on the first item; copy writes the decoded text', async () => {
      await boot(clubAs('member'), [msg(2, { text: 'a &lt;b&gt;' })]);
      coarse = true;
      await openChat();
      const more = rowEl(2).querySelector('.cb-tools__more');
      expect(more.tabIndex).toBe(0);
      more.click();
      expect(document.activeElement.dataset.act).toBe('copy');
      document.activeElement.click();
      await flush();
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('a <b>');
      expect(document.getElementById('cb-msg').textContent).toBe('clubs.copied');
    });

    it('edit lifecycle: bar + ✓, PATCH, row patched in place with "đã sửa"; Esc cancels; unchanged sends nothing; ↑ edits my last text', async () => {
      const list = [msg(1, { mine: true, text: 'cũ &lt;xưa&gt;' }), msg(2)];
      await boot(clubAs('member'), list);
      stub(clubAs('member'), (u) => ({ messages: u.includes('after=') ? [] : list }), (b) => ({ id: 1, text: b.text.replace('<', '&lt;'), editedAt: '2026-10-10T11:00:00.000Z' }));
      await openChat();
      const before = rowEl(1);
      rowEl(1).querySelector('[data-act="edit"]').click();
      expect(document.getElementById('cb-editbar').hidden).toBe(false);
      expect(document.getElementById('cb-edit-orig').textContent).toBe('cũ <xưa>');
      expect(input().value).toBe('cũ <xưa>');
      expect(document.activeElement).toBe(input());
      expect(document.getElementById('cb-chat-send').getAttribute('aria-label')).toBe('clubs.edit_save');
      expect(document.querySelector('#cb-chat-send use').getAttribute('href')).toMatch(/#ph-regular-check$/);
      expect(rowEl(1).classList.contains('is-editing')).toBe(true);
      // unchanged: no request, edit mode ends
      document.getElementById('cb-chat-form').onsubmit(new Event('submit'));
      await flush();
      expect(global.fetch.mock.calls.some(([, o]) => o && o.method === 'PATCH')).toBe(false);
      expect(document.getElementById('cb-editbar').hidden).toBe(true);
      // ↑ in the empty composer picks my last text message; Esc cancels
      key('ArrowUp');
      expect(document.getElementById('cb-editbar').hidden).toBe(false);
      key('Escape');
      expect(document.getElementById('cb-editbar').hidden).toBe(true);
      expect(input().value).toBe('');
      expect(document.getElementById('cb-chat-send').getAttribute('aria-label')).toBe('clubs.chat_send');
      // a slash-looking edit is text: no command popup, straight PATCH
      key('ArrowUp');
      type('/ghim <mới> hay');
      expect(document.getElementById('cb-chat-hints').hidden).toBe(true);
      document.getElementById('cb-chat-form').onsubmit(new Event('submit'));
      await flush(); await flush();
      const patch = global.fetch.mock.calls.find(([, o]) => o && o.method === 'PATCH');
      expect(patch[0]).toBe('/api/clubs/caro/messages/1');
      expect(JSON.parse(patch[1].body)).toEqual({ text: '/ghim <mới> hay' });
      expect(global.fetch.mock.calls.some(([u, o]) => String(u).endsWith('/messages') && o && o.method === 'POST')).toBe(false);
      expect(rowEl(1)).toBe(before);
      expect(rowEl(1).querySelector('.cb-chat__text').textContent).toBe('/ghim <mới> hay');
      expect(rowEl(1).querySelector('.cb-chat__edited').textContent).toBe('clubs.edited');
      expect(document.getElementById('cb-editbar').hidden).toBe(true);
      expect(rowEl(1).classList.contains('is-editing')).toBe(false);
    });

    it('a refused PATCH keeps edit mode and the text; deleting the row being edited ends edit mode', async () => {
      jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setImmediate', 'nextTick'] });
      let removed = [];
      await boot(clubAs('member'), [msg(1, { mine: true })]);
      stub(clubAs('member'), (u) => (u.includes('after=') ? { messages: [], removed } : { messages: [msg(1, { mine: true })] }),
        () => ({ ok: false, code: 'CLUB_MUTED', error: 'muted' }));
      await openChat();
      key('ArrowUp');
      type('sửa');
      document.getElementById('cb-chat-form').onsubmit(new Event('submit'));
      await flush(); await flush();
      expect(document.getElementById('cb-editbar').hidden).toBe(false);
      expect(input().value).toBe('sửa');
      expect(document.getElementById('cb-msg').textContent).not.toBe('');
      try {
        removed = [1];
        jest.advanceTimersByTime(8000);
        await flush(); await flush();
      } finally { jest.useRealTimers(); }
      expect(rowEl(1)).toBeNull();
      expect(document.getElementById('cb-editbar').hidden).toBe(true);
    });

    it('rev cursor: sent from the GET reply only; edits from a tick patch rows in place; PATCH and older pages never move it', async () => {
      jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setImmediate', 'nextTick'] });
      try {
        let tick = { messages: [], rev: 5 };
        await boot(clubAs('member'), [msg(60, { mine: true })]);
        stub(clubAs('member'), (u) => {
          if (u.includes('before=')) return { messages: [msg(10)], rev: 99 };
          if (u.includes('after=')) return tick;
          return { messages: Array.from({ length: 50 }, (_, i) => msg(11 + i, { mine: i === 49 })), rev: 5 };
        }, (b) => ({ id: 60, text: b.text, editedAt: AT }));
        localStorage.setItem('gvn_club_seen_caro', '60');
        await openChat();
        const other = rowEl(11);
        // my PATCH carries no rev: the next tick still asks from 5
        key('ArrowUp');
        type('mới');
        document.getElementById('cb-chat-form').onsubmit(new Event('submit'));
        await flush(); await flush();
        jest.advanceTimersByTime(8000);
        await flush(); await flush();
        expect(gets().at(-1)).toMatch(/&visible=[\d,]+&rev=5$/);
        // older page with a bigger rev: ignored
        document.getElementById('cb-chat-older').click();
        await flush(); await flush();
        tick = { messages: [], rev: 6, edited: [{ id: 11, text: 'đã đổi &lt;x&gt;', editedAt: AT, mentioned: [] }] };
        jest.advanceTimersByTime(8000);
        await flush(); await flush();
        expect(gets().at(-1)).toMatch(/&rev=5$/);
        expect(rowEl(11)).toBe(other);
        expect(rowEl(11).querySelector('.cb-chat__text').textContent).toBe('đã đổi <x>');
        expect(rowEl(11).querySelector('.cb-chat__edited')).not.toBeNull();
        tick = { messages: [], rev: 6, edited: [] };
        jest.advanceTimersByTime(8000);
        await flush(); await flush();
        expect(gets().at(-1)).toMatch(/&rev=6$/);
        expect(localStorage.getItem('gvn_club_seen_caro')).toBe('60'); // edits never move the unread cursor
        expect(document.getElementById('cb-chat-unread').hidden).toBe(true);
      } finally { jest.useRealTimers(); }
    });

    it('a tick that left before my PATCH cannot repaint the row with the older text', async () => {
      jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setImmediate', 'nextTick'] });
      try {
        await boot(clubAs('member'), [msg(1, { mine: true, text: 'cũ' })]);
        let release;
        global.fetch = jest.fn((url, o = {}) => {
          const u = String(url);
          if (o.method === 'PATCH') return ok({ id: 1, text: 'mới', editedAt: AT });
          if (u.includes('after=')) return new Promise((r) => { release = () => r({ ok: true, status: 200, json: () => Promise.resolve({ messages: [], rev: 3, edited: [{ id: 1, text: 'giữa', editedAt: AT, mentioned: [] }] }) }); });
          if (u.includes('/messages')) return ok({ messages: [msg(1, { mine: true, text: 'cũ' })], rev: 2 });
          return ok(clubAs('member'));
        });
        await openChat();
        jest.advanceTimersByTime(8000); // tick out with the pre-edit row version
        await flush();
        key('ArrowUp');
        type('mới');
        document.getElementById('cb-chat-form').onsubmit(new Event('submit'));
        await flush(); await flush();
        expect(rowEl(1).querySelector('.cb-chat__text').textContent).toBe('mới');
        release();
        await flush(); await flush();
        expect(rowEl(1).querySelector('.cb-chat__text').textContent).toBe('mới');
      } finally { jest.useRealTimers(); }
    });

    it('report dialog replaces window.prompt: preset reason, "Lý do khác" needs text, POSTs the reason', async () => {
      await boot(clubAs('member'), [msg(2)]);
      stub(clubAs('member'), () => ({ messages: [msg(2)] }));
      window.prompt = jest.fn();
      await openChat();
      const dlg = document.getElementById('cb-dlg-report');
      rowEl(2).querySelector('[data-act="report"]').click();
      expect(dlg.hasAttribute('open')).toBe(true);
      expect(document.activeElement.value).toBe('abuse');
      expect(document.getElementById('cb-report-more').hidden).toBe(true);
      const other = dlg.querySelector('input[value="other"]');
      other.checked = true;
      other.dispatchEvent(new Event('change', { bubbles: true }));
      expect(document.getElementById('cb-report-more').hidden).toBe(false);
      global.fetch.mockClear();
      document.getElementById('cb-report-form').onsubmit(new Event('submit', { cancelable: true }));
      await flush();
      expect(global.fetch).not.toHaveBeenCalled();
      expect(document.getElementById('cb-report-error').textContent).toBe('clubs.report_need_text');
      document.getElementById('cb-report-text').value = '  lừa đảo  ';
      document.getElementById('cb-report-form').onsubmit(new Event('submit', { cancelable: true }));
      await flush(); await flush();
      expect(global.fetch.mock.calls[0][0]).toBe('/api/clubs/caro/messages/2/report');
      expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ reason: 'lừa đảo' });
      expect(dlg.hasAttribute('open')).toBe(false);
      expect(document.getElementById('cb-msg').textContent).toBe('clubs.report_sent');
      expect(document.activeElement).toBe(rowEl(2).querySelector('.cb-tools__more'));
      // a preset reason sends its label
      rowEl(2).querySelector('[data-act="report"]').click();
      global.fetch.mockClear();
      document.getElementById('cb-report-form').onsubmit(new Event('submit', { cancelable: true }));
      await flush(); await flush();
      expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ reason: 'clubs.report_abuse' });
      expect(window.prompt).not.toHaveBeenCalled();
    });

    it('own delete: "Xoá tin nhắn này?" + no-undo note; Huỷ sends nothing and returns focus to ⋯', async () => {
      await boot(clubAs('member'), [msg(1, { mine: true })]);
      await openChat();
      rowEl(1).querySelector('[data-act="delete"]').click();
      expect(document.getElementById('cb-dlg-delete-h').textContent).toBe('clubs.confirm_delete_message');
      expect(document.getElementById('cb-dlg-delete-warn').textContent).toBe('clubs.delete_warn_own');
      global.fetch.mockClear();
      document.getElementById('cb-dlg-delete-cancel').click();
      expect(global.fetch).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(rowEl(1).querySelector('.cb-tools__more'));
    });

    it('dialogs live inside .cl-hq; every new string is in both dictionaries', () => {
      for (const id of ['cb-sheet-actions', 'cb-dlg-delete', 'cb-dlg-report']) expect(document.getElementById(id).closest('.cl-hq')).not.toBeNull();
      const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n.js'), 'utf8');
      for (const k of ['clubs.editing', 'clubs.edit_save', 'clubs.edited', 'clubs.act_select', 'clubs.delete_warn_staff', 'clubs.report_need_text', 'clubs.msg_actions_of']) {
        expect(src.split("'" + k + "'").length - 1).toBe(2);
      }
    });
  });

  describe('polls (B449)', () => {
    const AT = '2026-10-10T10:00:00.000Z';
    const POLL = { options: ['20h', '21h &lt;tối&gt;'], counts: [1, 3], total: 4, myOption: null, closesAt: '2026-10-11T10:00:00.000Z', closed: false, canClose: false };
    const row = (poll, extra = {}) => ({ id: 7, kind: 'poll', text: 'Mấy giờ &lt;?&gt;', createdAt: AT, username: 'own', displayName: 'Own', poll, ...extra });
    const card = () => document.querySelector('.cb-poll');
    const opts = () => [...document.querySelectorAll('.cb-poll__opt')];
    const links = () => [...document.querySelectorAll('.cb-poll__link')].map((b) => b.textContent);
    const openChat = async () => { document.getElementById('cb-ch-events').click(); document.getElementById('cb-ch-chat').click(); await flush(); await flush(); };

    /** fetch stub: GET messages → `msgs`, POST vote/close → `{poll: next(body)}`, voters → `voters`. */
    function stub(club, msgs, { next, voters, polls } = {}) {
      global.fetch = jest.fn((url, o) => {
        const u = String(url);
        if (u.endsWith('/voters')) return ok({ voters });
        if (u.endsWith('/vote') || u.endsWith('/close')) return ok({ poll: next(o.body ? JSON.parse(o.body) : null, u) });
        if (u.includes('/messages')) return ok({ messages: typeof msgs === 'function' ? msgs(u) : msgs, ...(polls ? { polls: polls(u) } : {}) });
        return ok(club);
      });
    }

    it('renders as a system row: title, decoded question, option buttons with server counts as bars; no voter names', async () => {
      await boot(clubAs('member'), [row(POLL)]);
      await openChat();
      const r = document.querySelector('.cb-chat__msg--sys');
      expect(r.querySelector('.cb-chat__sys-t').textContent).toContain('clubs.sys_poll{"name":"Own"}');
      expect(r.querySelector('.cb-poll__q').textContent).toBe('Mấy giờ <?>');
      expect(opts().map((b) => b.querySelector('.cb-poll__label').textContent)).toEqual(['20h', '21h <tối>']);
      expect(opts().map((b) => b.querySelector('.cb-poll__n').textContent)).toEqual(['clubs.poll_votes{"n":1}', 'clubs.poll_votes{"n":3}']);
      expect(opts().map((b) => b.style.getPropertyValue('--pct'))).toEqual(['25%', '75%']);
      expect(opts().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false']);
      expect(card().dataset.open).toBe('1');
      expect(links()).toEqual(['clubs.poll_voters']); // not creator/staff → no close
      expect(r.querySelector('.cb-poll b')).toBeNull();
      expect(r.querySelector('.cb-poll [href]')).toBeNull();
    });

    it('tap votes; tapping my own option sends null (take back); card repaints from the server reply only', async () => {
      await boot(clubAs('member'), [row(POLL)]);
      stub(clubAs('member'), [row(POLL)], { next: (b) => (b.option === null ? POLL : { ...POLL, counts: [2, 3], total: 5, myOption: 0 }) });
      await openChat();
      opts()[0].click();
      await flush(); await flush();
      const post = global.fetch.mock.calls.find(([u]) => String(u).includes('/vote'));
      expect(post[0]).toBe('/api/clubs/caro/messages/7/vote');
      expect(JSON.parse(post[1].body)).toEqual({ option: 0 });
      expect(opts()[0].getAttribute('aria-pressed')).toBe('true');
      expect(opts()[0].classList.contains('is-mine')).toBe(true);
      expect(opts()[0].querySelector('.cb-poll__n').textContent).toBe('clubs.poll_votes{"n":2}');
      opts()[0].click();
      await flush(); await flush();
      expect(JSON.parse(global.fetch.mock.calls.filter(([u]) => String(u).includes('/vote')).at(-1)[1].body)).toEqual({ option: null });
      expect(opts()[0].getAttribute('aria-pressed')).toBe('false');
    });

    it('closed poll: buttons disabled, "closed" label, no close button, not refreshed on the tick', async () => {
      await boot(clubAs('owner'), [row({ ...POLL, closed: true, myOption: 1 })]);
      await openChat();
      expect(opts().every((b) => b.disabled)).toBe(true);
      expect(card().dataset.open).toBe('0');
      expect([...document.querySelectorAll('.cb-poll__foot .cl-count')].map((n) => n.textContent)).toEqual(['clubs.poll_total{"n":4}', 'clubs.poll_closed']);
      expect(links()).toEqual(['clubs.poll_voters']);
    });

    it('creator/staff get "close"; confirming posts /close and repaints closed', async () => {
      await boot(clubAs('owner'), [row({ ...POLL, canClose: true })]);
      stub(clubAs('owner'), [row({ ...POLL, canClose: true })], { next: () => ({ ...POLL, closed: true }) });
      await openChat();
      expect(links()).toEqual(['clubs.poll_voters', 'clubs.poll_close']);
      window.confirm = jest.fn(() => true);
      document.querySelectorAll('.cb-poll__link')[1].click();
      await flush(); await flush();
      expect(window.confirm).toHaveBeenCalledWith('clubs.confirm_poll_close');
      expect(global.fetch.mock.calls.some(([u, o]) => u === '/api/clubs/caro/messages/7/close' && o.method === 'POST')).toBe(true);
      expect(opts().every((b) => b.disabled)).toBe(true);
    });

    it('"who voted" fetches names on demand and lists them per option as profile links', async () => {
      await boot(clubAs('member'), [row(POLL)]);
      stub(clubAs('member'), [row(POLL)], { voters: [[{ username: 'own', displayName: 'Own' }], [{ username: 'mem', displayName: 'Mem' }, { username: 'x_y', displayName: '<X>' }]] });
      await openChat();
      document.querySelector('.cb-poll__link').click();
      await flush(); await flush();
      expect(global.fetch.mock.calls.some(([u]) => u === '/api/clubs/caro/messages/7/voters')).toBe(true);
      const rows = [...document.querySelectorAll('.cb-poll__whorow')];
      expect(rows.map((r) => r.textContent)).toEqual(['20hOwn', '21h <tối>Mem, <X>']);
      expect(rows[1].querySelector('a').getAttribute('href')).toBe('/u/mem');
      expect(document.querySelector('.cb-poll__link').getAttribute('aria-expanded')).toBe('true');
      document.querySelector('.cb-poll__link').click();
      expect(document.querySelector('.cb-poll__who')).toBeNull();
    });

    it('chat tick asks for fresh state of open cards only and patches them in place', async () => {
      jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setImmediate', 'nextTick'] });
      try {
        const list = [row(POLL), row({ ...POLL, closed: true }, { id: 8 })];
        await boot(clubAs('member'), list);
        stub(clubAs('member'), (u) => (u.includes('after=') ? [] : list), { polls: () => ({ 7: { ...POLL, counts: [4, 3], total: 7 } }) });
        await openChat();
        const before = card();
        jest.advanceTimersByTime(8000);
        await flush(); await flush();
        expect(global.fetch.mock.calls.at(-1)[0]).toBe('/api/clubs/caro/messages?after=8&visible=7,8&polls=7');
        expect(card()).toBe(before);
        expect(opts()[0].querySelector('.cb-poll__n').textContent).toBe('clubs.poll_votes{"n":4}');
      } finally {
        jest.useRealTimers();
      }
    });

    it('a tick reply that lands after my vote does not repaint the card with the older state', async () => {
      jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setImmediate', 'nextTick'] });
      try {
        await boot(clubAs('member'), [row(POLL)]);
        let releaseTick;
        global.fetch = jest.fn((url, o) => {
          const u = String(url);
          if (u.endsWith('/vote')) return ok({ poll: { ...POLL, counts: [2, 3], total: 5, myOption: 0 } });
          if (u.includes('polls=')) return new Promise((r) => { releaseTick = () => r({ ok: true, status: 200, json: () => Promise.resolve({ messages: [], polls: { 7: POLL } }) }); });
          if (u.includes('/messages')) return ok({ messages: [row(POLL)] });
          return ok(clubAs('member'));
        });
        await openChat();
        jest.advanceTimersByTime(8000); // tick goes out with the pre-vote state pending
        await flush();
        opts()[0].click();
        await flush(); await flush();
        expect(opts()[0].getAttribute('aria-pressed')).toBe('true');
        releaseTick();
        await flush(); await flush();
        expect(opts()[0].getAttribute('aria-pressed')).toBe('true');
        expect(opts()[0].querySelector('.cb-poll__n').textContent).toBe('clubs.poll_votes{"n":2}');
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('unread dot', () => {
    it('first visit: history is not unread; later visit with newer messages by others shows the dot until trò-chuyện is opened', async () => {
      location.hash = '#ch=events';
      await boot(clubAs('member', { lastMessageId: 5 }));
      expect(dot().hidden).toBe(true);
      expect(localStorage.getItem('gvn_club_seen_caro')).toBe('5');
      await boot(clubAs('member', { lastMessageId: 9 }), [{ id: 9, kind: 'text', text: 'x', createdAt: '2026-10-10T10:00:00.000Z', username: 'own', displayName: 'Own' }]);
      expect(dot().hidden).toBe(false);
      document.getElementById('cb-ch-chat').click();
      await flush(); await flush();
      expect(dot().hidden).toBe(true);
      expect(localStorage.getItem('gvn_club_seen_caro')).toBe('9');
      document.getElementById('cb-ch-events').click();
      expect(dot().hidden).toBe(true);
    });

    it('first visit to an empty chat still records the baseline, so later messages show the dot', async () => {
      location.hash = '#ch=events';
      await boot(clubAs('member', { lastMessageId: 0 }));
      expect(localStorage.getItem('gvn_club_seen_caro')).toBe('0');
      await boot(clubAs('member', { lastMessageId: 3 }));
      expect(dot().hidden).toBe(false);
    });

    it('off in settings → never shown', async () => {
      localStorage.setItem('gvn_club_seen_caro', '1');
      location.hash = '#ch=events';
      await boot(clubAs('member', { lastMessageId: 9, chat: { ...DEFAULTS, unreadDot: false } }));
      expect(dot().hidden).toBe(true);
    });

    it('away from trò-chuyện the poll asks only for messages after the cursor; my own never light the dot', async () => {
      jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setImmediate', 'nextTick'] });
      try {
        location.hash = '#ch=events';
        localStorage.setItem('gvn_club_seen_caro', '4');
        let reply = [{ id: 5, kind: 'text', text: 'mine', createdAt: '2026-10-10T10:00:00.000Z', username: 'mem', displayName: 'Mem', mine: true }];
        await boot(clubAs('member', { lastMessageId: 4 }), () => reply);
        expect(dot().hidden).toBe(true);
        jest.advanceTimersByTime(8000);
        await flush(); await flush();
        expect(global.fetch.mock.calls.at(-1)[0]).toBe('/api/clubs/caro/messages?after=4');
        expect(dot().hidden).toBe(true);
        reply = [{ id: 6, kind: 'text', text: 'hi', createdAt: '2026-10-10T10:00:00.000Z', username: 'own', displayName: 'Own', mine: false }];
        jest.advanceTimersByTime(8000);
        await flush(); await flush();
        expect(global.fetch.mock.calls.at(-1)[0]).toBe('/api/clubs/caro/messages?after=5');
        expect(dot().hidden).toBe(false);
      } finally {
        jest.useRealTimers();
      }
    });

    it('opening trò-chuyện after the dot lit fetches the newer messages at once', async () => {
      jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setImmediate', 'nextTick'] });
      try {
        let reply = [{ id: 4, kind: 'text', text: 'old', createdAt: '2026-10-10T10:00:00.000Z', username: 'own', displayName: 'Own', mine: false }];
        await boot(clubAs('member', { lastMessageId: 4 }), () => reply);
        document.getElementById('cb-ch-events').click();
        document.getElementById('cb-ch-chat').click(); // loads the chat (newest)
        await flush(); await flush();
        document.getElementById('cb-ch-events').click();
        reply = [{ id: 5, kind: 'text', text: 'new', createdAt: '2026-10-10T10:01:00.000Z', username: 'own', displayName: 'Own', mine: false }];
        jest.advanceTimersByTime(8000);
        await flush(); await flush();
        expect(dot().hidden).toBe(false);
        global.fetch.mockClear();
        document.getElementById('cb-ch-chat').click();
        await flush(); await flush();
        expect(global.fetch.mock.calls.map(([u]) => u)).toEqual(['/api/clubs/caro/messages?after=4&visible=4']);
        expect([...document.querySelectorAll('.cb-chat__text')].map((n) => n.textContent)).toEqual(['old', 'new']);
        expect(dot().hidden).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    it('visitors never poll and never see a dot', async () => {
      jest.useFakeTimers({ doNotFake: ['setTimeout', 'clearTimeout', 'setImmediate', 'nextTick'] });
      try {
        await boot({ ...CLUB, chat: DEFAULTS });
        jest.advanceTimersByTime(16000);
        await flush();
        expect(global.fetch.mock.calls.some(([u]) => String(u).includes('/messages'))).toBe(false);
        expect(dot().hidden).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  it('chat notifications open the club on trò-chuyện; join requests still open đơn-xin-vào', async () => {
    await bootClub(CLUB);
    const target = window.PlatformShell.notifications.target;
    for (const type of ['club_mention', 'club_all', 'club_pin']) {
      expect(target({ type, payload: { club: { slug: 'caro', name: 'C' } } })).toBe('/c/caro#ch=chat');
    }
    expect(target({ type: 'club_request', payload: { club: { slug: 'caro' } } })).toBe('/c/caro#ch=requests');
    expect(target({ type: 'club_invite', payload: { club: { slug: 'caro' } } })).toBe('/c/caro');
  });
});

it('filters the roster by role and keeps sanction controls scoped to staff', async () => {
  await bootClub({ ...CLUB, myRole: 'member' });
  const filter = document.getElementById('cb-role-filter');
  filter.value = 'officer';
  filter.onchange();
  expect(document.getElementById('cb-members-body').textContent).not.toContain('clubs.role_owner');
  expect(document.getElementById('cb-bulk').hidden).toBe(true);
});

it('thành-viên filter bar uses the platform form controls (search pill, .pform selects, styled bulk row)', async () => {
  await bootClub({ ...CLUB, myRole: 'owner' });
  const search = document.getElementById('cb-member-search');
  expect(search.closest('label').classList.contains('psearch')).toBe(true);
  expect(search.closest('label').querySelector('.psearch__icon')).not.toBeNull();
  expect(search.getAttribute('aria-label')).toBe('Tìm thành viên');
  for (const id of ['cb-role-filter', 'cb-member-sort']) {
    expect(document.getElementById(id).closest('.pform')).not.toBeNull();
    expect(document.getElementById(id).closest('.cl-filter')).not.toBeNull();
  }
  for (const id of ['cb-bulk-action', 'cb-minutes']) expect(document.getElementById(id).closest('.pform.cl-filter__bulk')).not.toBeNull();
  expect(document.getElementById('cb-bulk').hidden).toBe(false);
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'club.css'), 'utf8');
  expect(css).toMatch(/\.cl-filter \{[^}]*display: flex/);
  expect(css).toMatch(/\.cl-filter \.psearch \{[^}]*min-height: 44px/);
  // Filter still drives the roster after the markup move.
  search.value = 'zzz-nobody';
  search.oninput();
  expect(document.getElementById('cb-members-body').textContent).not.toContain('clubs.role_owner');
});

it('inserts a group mention at the caret and retains the surrounding draft', async () => {
  await bootClub({ ...CLUB, myRole: 'member', chat: { notifyMention: true } });
  const input = document.getElementById('cb-chat-input');
  input.value = 'Chào @off hôm nay';
  input.setSelectionRange(9, 9);
  input.dispatchEvent(new Event('input'));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', cancelable: true }));
  expect(input.value).toBe('Chào @officers hôm nay');
});

it('loads activity on opening the board as a member with separate meta spans and hides it for non-members', async () => {
  await bootClub(CLUB);
  global.fetch = jest.fn();
  document.getElementById('cb-ch-board').click();
  await flush();
  expect(document.getElementById('cb-activity').hidden).toBe(true);
  expect(global.fetch).not.toHaveBeenCalled();
  expect(document.getElementById('cb-rating-summary').textContent).toBe('Điểm trung bình của nhóm là 1500 từ 1 thành viên đã xếp hạng, hạng #3.');
  expect(document.getElementById('cb-rating-summary').textContent).not.toContain('·');

  await bootClub({ ...CLUB, myRole: 'member' });
  global.fetch = jest.fn(() => ok({
    activity: [{ username: 'mai', displayName: 'Mai', avatarUrl: null, games: 3 }],
    recent: [{ id: 'g1', black: 'Own', white: 'Mai', endedAt: '2026-11-25T05:00:00.000Z', result: 'BLACK' }],
  }));
  document.getElementById('cb-ch-board').click();
  await flush();
  expect(document.getElementById('cb-activity').hidden).toBe(false);
  expect(document.querySelector('#cb-activity-list .prow__t').textContent).toBe('Mai');
  expect([...document.querySelectorAll('#cb-activity-list .prow__meta > span')].map((s) => s.textContent)).toEqual(['3 ván trong tuần']);
  expect(document.getElementById('cb-activity-list').textContent).not.toContain('·');
  expect(document.querySelector('#cb-recent .prow__t').textContent).toBe('Own – Mai');
  expect(document.querySelectorAll('#cb-recent .prow__meta > span')).toHaveLength(2);
  expect(document.querySelector('#cb-recent .prow__meta > span').textContent).toBe('Own thắng');
});

it('lists club team tournaments in Giải của CLB with both club names and separate meta spans (B460)', async () => {
  await bootClub({
    ...CLUB,
    myRole: 'member',
    tournaments: [{
      id: 'tm-1',
      name: 'Giao lưu Bắc Nam',
      format: 'team',
      status: 'active',
      createdAt: '2026-11-25T00:00:00Z',
      startedAt: '2026-11-25T01:00:00Z',
      players: 4,
      teams: [{ slug: 'caro', name: 'CLB Caro' }, { slug: 'renju', name: 'CLB Renju' }],
    }],
  });
  document.getElementById('cb-ch-tournaments').click();
  const row = document.querySelector('#cb-tournaments a.prow');
  expect(row.getAttribute('href')).toBe('/tournament.html?id=tm-1');
  const spans = [...row.querySelectorAll('.prow__meta > span')].map((s) => s.textContent);
  expect(spans).toContain('Đấu đội CLB');
  expect(spans).toContain('CLB Caro đấu CLB Renju');
  expect(row.textContent).not.toContain('·');
});

it('renders previews, sanctions and command aliases as separate facts, never a joined "a · b" string', async () => {
  await bootClub({ ...CLUB, myRole: 'owner', sanctions: [{ username: 'xau', kind: 'ban', untilAt: null }] });
  document.getElementById('cb-ch-members')?.click();
  await flush();
  const sanction = document.querySelector('#cb-sanctions .prow');
  expect(sanction.querySelector('.prow__t').textContent).toBe('xau');
  expect([...sanction.querySelectorAll('.prow__meta > span')].map((s) => s.textContent)).toEqual(['Bị cấm']);

  const dlg = document.getElementById('cb-poll-editor');
  dlg.showModal = dlg.showModal || jest.fn();
  document.getElementById('cb-poll-new').onclick();
  document.getElementById('cb-question').value = 'Ăn gì';
  const [o1, o2] = document.querySelectorAll('#cb-options input');
  o1.value = 'Phở'; o2.value = 'Bún';
  document.getElementById('cb-poll-form').oninput();
  expect(document.querySelector('#cb-poll-preview .cb-poll__q').textContent).toBe('Ăn gì');
  expect([...document.querySelectorAll('#cb-poll-preview .cb-poll__label')].map((s) => s.textContent)).toEqual(['Phở', 'Bún']);

  // club.js never joins facts with a middle dot (feedback rule; ticket-rows.md)
  expect(fs.readFileSync(path.join(__dirname, '..', 'js', 'club.js'), 'utf8')).not.toMatch(/join\(['"] · ['"]\)|\+ ' · ' \+/);
});

test('#474 club controls: soft tonal buttons, aligned field rows, subtle motion with a reduced-motion path', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'club.css'), 'utf8');
  // no hard 1.5px ring on the base button; hover changes fill, not opacity
  expect(css).toMatch(/\.cl-hq \.pbtn \{[^}]*box-shadow: none/);
  expect(css).toMatch(/\.cl-hq \.pbtn:hover:not\(:disabled\) \{ opacity: 1;/);
  // a button beside 44px fields takes their height (one shared bottom edge)
  expect(css).toMatch(/:is\(\.pform__row, \.cb-inline, \.cl-filter__bulk\) > \.pbtn \{ min-height: 44px; \}/);
  // motion: transform/opacity only, never `transition: all`, all killed under reduced motion
  expect(css).not.toMatch(/transition:\s*all/);
  expect(css).toMatch(/@property --pct/);
  expect(css).toMatch(/@starting-style \{ dialog\.cl-editor\[open\]/);
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\s*\.cl-hq \*, \.cl-hq \*::before, \.cl-hq \*::after \{ animation: none !important; transition: none !important; \}/);
  for (const [, body] of css.matchAll(/@keyframes [\w-]+ \{([^}]*\})/g)) expect(body).not.toMatch(/\b(width|height|top|left|margin)\s*:/);
});

it('#474 staff roster: rows without a select box keep an empty slot, so every name starts in one column', async () => {
  await bootClub({ ...CLUB, myRole: 'owner' });
  const firsts = [...document.querySelectorAll('#cb-members-body tr td:first-child')].map((td) => td.firstElementChild);
  expect(firsts.length).toBeGreaterThan(1);
  expect(firsts.some((n) => n.matches('input[type="checkbox"]'))).toBe(true);
  for (const n of firsts) expect(n.matches('input[type="checkbox"], .cl-check-slot')).toBe(true);
});
