/**
 * TODO.md #177 — profile page: renders as text, privacy states, owner-only edit panel.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/u/alice"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const BODY_HTML = fs.readFileSync(path.join(__dirname, '..', 'profile.html'), 'utf8')
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');

const PROFILE = {
  username: 'alice', displayName: '<img src=x onerror=alert(1)>', createdAt: '2026-03-01T00:00:00.000Z',
  avatarUrl: null, bio: 'hi <b>there</b>',
  ratings: [{ category: 'caro', rating: 1650, rank: 7, games: 40, provisional: false, delta7: 14 }],
  stats: { games: 10, wins: 6, draws: 1 },
  recent: [{ id: 'g1', opponent: 'bob', result: 'win', endedAt: '2026-10-01T00:00:00.000Z' }],
  isSelf: false,
};

let HISTORY = { hidden: false, points: [{ t: 'a', rating: 1500 }, { t: 'b', rating: 1580 }, { t: 'c', rating: 1650 }], peak: 1700 };
const flush = () => new Promise((r) => setTimeout(r, 0));

async function boot(profile, status = 200) {
  jest.resetModules();
  document.body.innerHTML = BODY_HTML;
  window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
  global.fetch = jest.fn((url) => (String(url).includes('/rating-history')
    ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(HISTORY) })
    : Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve(profile) })));
  require('../js/platform-shell.js');
  require('../js/profile.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await flush(); await flush();
}

describe('profile page', () => {
  beforeEach(() => { HISTORY = { hidden: false, points: [{ t: 'a', rating: 1500 }, { t: 'b', rating: 1580 }, { t: 'c', rating: 1650 }], peak: 1700 }; });

  it('card shows the weekly change; chart plots the curve with the all-time peak', async () => {
    await boot(PROFILE);
    expect(document.querySelector('.pcard small.up').textContent).toBe('profile.delta_week{"n":"+14"}');
    expect(global.fetch.mock.calls.some((c) => c[0] === '/api/profile/alice/rating-history?category=caro&days=90')).toBe(true);
    const svg = document.getElementById('pf-chart');
    expect(svg.hasAttribute('hidden')).toBe(false);
    expect(svg.querySelector('polyline').getAttribute('points').split(' ')).toHaveLength(3);
    expect(document.getElementById('pf-chart-note').textContent).toContain('1700');
  });

  it('hidden history → no weekly change, no chart, explanatory note', async () => {
    HISTORY = { hidden: true, points: [], peak: null };
    await boot({ ...PROFILE, ratings: [{ ...PROFILE.ratings[0], delta7: null }] });
    expect(document.querySelector('.pcard small.up, .pcard small.dn')).toBeNull();
    expect(document.getElementById('pf-chart').hasAttribute('hidden')).toBe(true);
    expect(document.getElementById('pf-chart-note').textContent).toBe('profile.chart_hidden');
  });

  it('one data point is not a curve → empty note', async () => {
    HISTORY = { hidden: false, points: [{ t: 'a', rating: 1500 }], peak: 1500 };
    await boot(PROFILE);
    expect(document.getElementById('pf-chart').hasAttribute('hidden')).toBe(true);
    expect(document.getElementById('pf-chart-note').textContent).toContain('profile.chart_empty');
  });

  it('renders user text as text, requests the path username', async () => {
    await boot(PROFILE);
    expect(global.fetch.mock.calls[0][0]).toBe('/api/profile/alice');
    expect(document.getElementById('pf-name').textContent).toBe(PROFILE.displayName);
    expect(document.querySelector('#pf-name img')).toBeNull();
    expect(document.getElementById('pf-bio').querySelector('b')).toBeNull();
    expect(document.querySelectorAll('.pcard')).toHaveLength(1);
    expect(document.querySelectorAll('#pf-recent .prow')).toHaveLength(1);
    expect(document.getElementById('pf-actions').hidden).toBe(true);
  });

  it('no clubs → the whole clubs card (not just its contents) is hidden and the grid is one column; with clubs → card shown', async () => {
    await boot({ ...PROFILE, clubs: [] });
    const panel = document.getElementById('pf-clubs-panel');
    expect(panel.hidden).toBe(true);
    expect(panel.classList.contains('ppanel')).toBe(true); // the card chrome lives on the hidden element
    expect(document.getElementById('pf-split').classList.contains('psplit--solo')).toBe(true);
    await boot({ ...PROFILE });  // field absent behaves like none
    expect(document.getElementById('pf-clubs-panel').hidden).toBe(true);
    await boot({ ...PROFILE, clubs: [{ slug: 'hn', name: '<b>HN</b>', role: 'member', members: 3 }] });
    expect(document.getElementById('pf-clubs-panel').hidden).toBe(false);
    expect(document.getElementById('pf-split').classList.contains('psplit--solo')).toBe(false);
    expect(document.querySelector('#pf-clubs a').getAttribute('href')).toBe('/c/hn');
    expect(document.querySelector('#pf-clubs b')).toBeNull();
  });

  it('shows the history-private note when stats are withheld', async () => {
    await boot({ ...PROFILE, stats: null, recent: [], bio: null });
    expect(document.getElementById('pf-recent-note').textContent).toBe('profile.history_hidden');
    expect(document.getElementById('pf-stats').children).toHaveLength(0);
  });

  it('shows the edit link (to /settings.html) only for the owner', async () => {
    await boot({ ...PROFILE, isSelf: true });
    expect(document.getElementById('pf-actions').hidden).toBe(false);
    expect(document.getElementById('pf-edit-btn').getAttribute('href')).toBe('/settings.html');
  });

  it('Tôi is the active mobile tab on the viewer\'s own profile only', async () => {
    await boot({ ...PROFILE, isSelf: true });
    expect(document.querySelector('.ptabbar a.is-active').dataset.tab).toBe('me');
    await boot({ ...PROFILE, isSelf: false });
    expect(document.querySelector('.ptabbar a.is-active')).toBeNull();
  });

  it('hides challenge / message / friend controls the target does not accept (#199)', async () => {
    await boot({ ...PROFILE, friendship: 'none', can: { dm: false, challenge: false, friend: false } });
    const box = document.getElementById('pf-social');
    expect(box.querySelectorAll('button')).toHaveLength(0);
    expect(box.querySelector('a')).toBeNull();
    expect([...box.querySelectorAll('.pnote')].map((n) => n.textContent)).toEqual(['privacy.no_friend', 'privacy.no_challenge', 'privacy.no_dm']);
  });

  it('shows city and country next to the join date, as text', async () => {
    require('../js/countries.js');
    await boot({ ...PROFILE, country: 'VN', city: '<b>Hà Nội</b>' });
    const text = document.getElementById('pf-joined').textContent;
    expect(text).toContain('<b>Hà Nội</b>, ');
    expect(document.querySelector('#pf-joined b')).toBeNull();
  });

  it('shows puzzles solved + level once something is solved; level "—" with a hint until a level reaches the threshold', async () => {
    await boot({ ...PROFILE, puzzles: { solved: 12, level: 'medium', byLevel: {}, threshold: 10 } });
    const text = document.getElementById('pf-stats').textContent;
    expect(text).toContain('profile.puzzles_solved12');
    expect(text).toContain('profile.puzzles_levelpuzzles.level_medium');
    await boot({ ...PROFILE, puzzles: { solved: 3, level: null, byLevel: {}, threshold: 10 } });
    const dd = [...document.querySelectorAll('#pf-stats div')].find((d) => d.textContent.includes('profile.puzzles_level'));
    expect(dd.querySelector('dd').textContent).toBe('—');
    expect(dd.title).toBe('profile.puzzles_level_hint{"n":10}');
    await boot({ ...PROFILE, puzzles: { solved: 0, level: null, byLevel: {}, threshold: 10 } });
    expect(document.getElementById('pf-stats').textContent).not.toContain('profile.puzzles');
    await boot({ ...PROFILE });
    expect(document.getElementById('pf-stats').textContent).not.toContain('profile.puzzles');
  });

  it('renders badges and the win streak; nothing when there are none', async () => {
    await boot({ ...PROFILE, badges: ['first_win', 'top_500'], streak: { current: 2, best: 5 } });
    expect([...document.querySelectorAll('#pf-badges .pbadge')].map((b) => b.textContent)).toEqual(['badge.first_win', 'badge.top_500']);
    expect(document.getElementById('pf-badges').hidden).toBe(false);
    expect(document.getElementById('pf-stats').textContent).toContain('profile.streak_val{"cur":2,"best":5}');
    await boot({ ...PROFILE, badges: [], streak: { current: 0, best: 0 } });
    expect(document.getElementById('pf-badges').hidden).toBe(true);
    expect(document.getElementById('pf-stats').textContent).not.toContain('profile.streak');
    await boot({ ...PROFILE, streak: null });
    expect(document.getElementById('pf-stats').textContent).not.toContain('profile.streak');
  });

  describe('friend button', () => {
    const labels = () => [...document.querySelectorAll('#pf-social > button')].map((b) => b.textContent).filter((l) => l !== 'challenge.btn');

    it.each([
      ['none', ['friends.add']],
      ['outgoing', ['friends.cancel']],
      ['incoming', ['friends.accept', 'friends.decline']],
      ['friends', ['friends.remove']],
    ])('state %s shows %j', async (friendship, expected) => {
      await boot({ ...PROFILE, friendship });
      expect(document.getElementById('pf-social').hidden).toBe(false);
      expect(labels()).toEqual(expected);
    });

    it('action buttons lead with an icon that matches them (B212)', async () => {
      await boot({ ...PROFILE, friendship: 'none' });
      const iconOf = (n) => n.querySelector('svg use').getAttribute('href').split('#')[1];
      const byText = (sel, txt) => [...document.querySelectorAll(sel)].find((n) => n.textContent === txt);
      expect(iconOf(byText('#pf-social > button', 'friends.add'))).toBe('ph-regular-user-plus');
      expect(iconOf(byText('#pf-social > button', 'challenge.btn'))).toBe('ph-regular-sword');
      expect(iconOf(byText('#pf-social > a', 'dm.btn'))).toBe('ph-regular-chat-circle');
    });

    describe('challenge', () => {
      const submit = async (fetchImpl) => {
        await boot({ ...PROFILE, friendship: 'none' });
        global.fetch = jest.fn(fetchImpl);
        const form = document.querySelector('#pf-social form');
        expect(form.hidden).toBe(true);
        [...document.querySelectorAll('#pf-social > button')].find((b) => b.textContent === 'challenge.btn').click();
        expect(form.hidden).toBe(false);
        form.querySelector('[name=rule]').value = 'standard';
        form.querySelector('[name=time]').value = '5+3';
        form.querySelector('input[type=checkbox]').checked = true;
        form.dispatchEvent(new Event('submit', { cancelable: true }));
        await flush(); await flush();
        return form;
      };

      it('offers the three rules and the four clocks; submit posts the choice to /api/challenges', async () => {
        const form = await submit(() => Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({}) }));
        expect([...form.querySelectorAll('[name=rule] option')].map((o) => o.value)).toEqual(['freestyle', 'standard', 'caro']);
        expect([...form.querySelectorAll('[name=time] option')].map((o) => o.value)).toEqual(['1+0', '3+2', '5+3', '10+0']);
        const [url, opts] = global.fetch.mock.calls[0];
        expect(url).toBe('/api/challenges');
        expect(JSON.parse(opts.body)).toEqual({ to: 'alice', rule: 'standard', time: '5+3', rated: true });
        expect(form.querySelector('.pnote').textContent).toBe('challenge.sent');
      });

      it('guest (403) is told members only; server error shows the generic error', async () => {
        let form = await submit(() => Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) }));
        expect(form.querySelector('.pnote').textContent).toBe('challenge.members_only');
        form = await submit(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
        expect(form.querySelector('.pnote').textContent).toBe('friends.error');
      });
    });

    it('Nhắn tin links to the DM thread on the social page', async () => {
      await boot({ ...PROFILE, friendship: 'none' });
      expect(document.querySelector('#pf-social a.pbtn').getAttribute('href')).toBe('/social.html#dm=alice');
    });

    it('is hidden on your own profile', async () => {
      await boot({ ...PROFILE, isSelf: true, friendship: 'self' });
      expect(document.getElementById('pf-social').hidden).toBe(true);
    });

    it('click sends the request and flips to the returned state', async () => {
      await boot({ ...PROFILE, friendship: 'none' });
      const base = global.fetch;
      global.fetch = jest.fn(() => Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({ status: 'outgoing' }) }));
      document.querySelector('#pf-social > button').click();
      await flush(); await flush();
      expect(global.fetch).toHaveBeenCalledWith('/api/friends/alice', expect.objectContaining({ method: 'POST' }));
      expect(labels()).toEqual(['friends.cancel']);
      global.fetch = base;
    });

    it('accept posts to /accept; failure re-enables the button and reports', async () => {
      await boot({ ...PROFILE, friendship: 'incoming' });
      global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
      document.querySelector('#pf-social > button').click();
      await flush(); await flush();
      expect(global.fetch.mock.calls[0][0]).toBe('/api/friends/alice/accept');
      expect(document.querySelector('#pf-social > button').disabled).toBe(false);
      expect(document.getElementById('pf-status').textContent).toBe('friends.error');
    });
  });

  it('shows a not-found message', async () => {
    await boot(null, 404);
    expect(document.getElementById('pf-status').textContent).toBe('profile.not_found');
    expect(document.getElementById('pf-content').hidden).toBe(true);
  });

  describe('game history (B202)', () => {
    it('rows link to /replay/<id>; "load more" is shown only when more games exist and appends the next page', async () => {
      await boot({ ...PROFILE, stats: { games: 12, wins: 1, draws: 0 } });
      expect(document.querySelector('#pf-recent a').getAttribute('href')).toBe('/replay/g1');
      expect(document.getElementById('pf-more').hidden).toBe(false);
      global.fetch.mockImplementation((u) => (String(u).includes('/games?page=2')
        ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ games: [{ id: 'g2', opponent: 'cy', result: 'loss', endedAt: '2026-10-02T00:00:00.000Z' }], pagination: { page: 2, limit: 10, total: 12, totalPages: 2 } }) })
        : Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) })));
      document.getElementById('pf-more').click();
      await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
      expect([...document.querySelectorAll('#pf-recent a')].map((a) => a.getAttribute('href'))).toEqual(['/replay/g1', '/replay/g2']);
      expect(global.fetch.mock.calls.at(-1)[0]).toBe('/api/profile/alice/games?page=2');
      expect(document.getElementById('pf-more').hidden).toBe(true);
    });

    it('no "load more" when the first page already holds every game or history is hidden', async () => {
      await boot({ ...PROFILE, stats: { games: 1, wins: 1, draws: 0 } });
      expect(document.getElementById('pf-more').hidden).toBe(true);
      await boot({ ...PROFILE, stats: null, recent: [] });
      expect(document.getElementById('pf-more').hidden).toBe(true);
    });
  });
});
