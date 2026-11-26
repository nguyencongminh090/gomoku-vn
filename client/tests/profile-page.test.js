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
  opponents: [{ name: 'bob', username: 'bobby', games: 10, wins: 6, losses: 3, draws: 1 }], opponentTotal: 1,
  isSelf: false,
};

let HISTORY = { hidden: false, points: [{ t: 'a', rating: 1500 }, { t: 'b', rating: 1580 }, { t: 'c', rating: 1650 }], peak: 1700 };
const flush = () => new Promise((r) => setTimeout(r, 0));

async function boot(profile, status = 200, pathname = '/u/alice') {
  window.history.pushState({}, '', pathname);
  jest.resetModules();
  document.body.innerHTML = BODY_HTML;
  window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
  global.fetch = jest.fn((url) => (String(url).includes('/rating-history')
    ? Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(HISTORY) })
    : Promise.resolve({ ok: status === 200, status, json: () => Promise.resolve(profile) })));
  require('../js/platform-shell.js');
  require('../js/challenge-modal.js');
  require('../js/profile.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
  await flush(); await flush();
}

describe('profile page', () => {
  beforeEach(() => { HISTORY = { hidden: false, points: [{ t: 'a', rating: 1500 }, { t: 'b', rating: 1580 }, { t: 'c', rating: 1650 }], peak: 1700 }; });

  it('fact strip shows the weekly change; chart plots the curve with the all-time peak', async () => {
    await boot(PROFILE);
    expect(document.querySelector('#pf-facts .pf-delta.up').textContent).toBe('+14');
    expect(global.fetch.mock.calls.some((c) => c[0] === '/api/profile/alice/rating-history?category=caro&days=90')).toBe(true);
    const svg = document.getElementById('pf-chart');
    expect(svg.hasAttribute('hidden')).toBe(false);
    expect(svg.querySelector('polyline').getAttribute('points').split(' ')).toHaveLength(3);
    expect(document.getElementById('pf-chart-note').textContent).toContain('1700');
  });

  it('B341: no delta line when the weekly change is 0', async () => {
    await boot({ ...PROFILE, ratings: [{ ...PROFILE.ratings[0], delta7: 0 }] });
    expect(document.querySelector('#pf-facts .pf-delta')).toBeNull();
    expect(document.getElementById('pf-facts').textContent).not.toContain('profile.fact_week');
  });

  it('B340: provisional rating shows a visible label; settled rating does not', async () => {
    await boot({ ...PROFILE, ratings: [{ ...PROFILE.ratings[0], provisional: true }] });
    expect(document.querySelector('#pf-ratings .pprov').textContent).toBe('profile.provisional_hint');
    expect(document.querySelector('#pf-ratings .pf-skill__r b').textContent).toBe('1650?');
    await boot(PROFILE);
    expect(document.querySelector('#pf-ratings .pprov')).toBeNull();
  });

  it('B342: only the highest badge of a tier family is shown', async () => {
    await boot({ ...PROFILE, badges: ['top_500', 'top_10', 'wins_100', 'wins_1000'] });
    expect([...document.querySelectorAll('#pf-badges .pbadge')].map((b) => b.textContent)).toEqual(['badge.top_10', 'badge.wins_1000']);
  });

  it('#403: page styles live in profile.css (no leftover .pprofile rules in platform.css); no middle-dot strings', () => {
    const platform = fs.readFileSync(path.join(__dirname, '..', 'css', 'platform.css'), 'utf8');
    expect(platform).not.toMatch(/\.pprofile/);
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'profile.css'), 'utf8');
    expect(css).toMatch(/\.pf-cv\s*\{/);
    expect(BODY_HTML).toContain('class="pf-cv"');
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'profile.js'), 'utf8');
    expect(src).not.toMatch(/' · '/);
    const i18n = fs.readFileSync(path.join(__dirname, '..', 'js', 'i18n.js'), 'utf8');
    expect(i18n.split('\n').filter((l) => /'profile\./.test(l) && l.includes('·'))).toEqual([]);
  });

  it('hidden history → no weekly change, no chart, explanatory note', async () => {
    HISTORY = { hidden: true, points: [], peak: null };
    await boot({ ...PROFILE, ratings: [{ ...PROFILE.ratings[0], delta7: null }] });
    expect(document.querySelector('#pf-facts .pf-delta')).toBeNull();
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
    expect(document.querySelectorAll('#pf-ratings .pf-skill')).toHaveLength(1);
    expect(document.querySelectorAll('#pf-recent tr')).toHaveLength(1);
    expect(document.getElementById('pf-side-name').textContent).toBe(PROFILE.displayName);
    expect(document.getElementById('pf-actions').hidden).toBe(true);
  });

  it('no clubs and no puzzles → the whole org block is hidden; with clubs → clubs section shown', async () => {
    await boot({ ...PROFILE, clubs: [] });
    expect(document.getElementById('pf-clubs-panel').hidden).toBe(true);
    expect(document.getElementById('pf-org').hidden).toBe(true);
    await boot({ ...PROFILE });  // field absent behaves like none
    expect(document.getElementById('pf-org').hidden).toBe(true);
    await boot({ ...PROFILE, clubs: [{ slug: 'hn', name: '<b>HN</b>', role: 'member', members: 3 }] });
    expect(document.getElementById('pf-clubs-panel').hidden).toBe(false);
    expect(document.getElementById('pf-org').hidden).toBe(false);
    // Role on its own line, member count separate (no "A · B" string, DESIGN.md Hồ sơ).
    expect(document.querySelector('#pf-clubs small').textContent).toBe('clubs.role_member');
    expect(document.querySelector('#pf-clubs .pf-club__cnt').textContent).toBe('3');
    expect(document.querySelector('#pf-clubs a').getAttribute('href')).toBe('/c/hn');
    expect(document.querySelector('#pf-clubs b')).toBeNull();
  });

  it('club rows show the club avatar image the server sent (same source as /clubs and the club page)', async () => {
    await boot({ ...PROFILE, clubs: [{ slug: 'hn', name: 'HN', role: 'member', members: 3, avatarUrl: '/api/clubs/hn/avatar?v=4' }] });
    const av = document.querySelector('#pf-clubs a .pav');
    expect(av.style.backgroundImage).toContain('/api/clubs/hn/avatar?v=4');
  });

  it('shows the history-private note when stats are withheld', async () => {
    await boot({ ...PROFILE, stats: null, opponents: [], opponentTotal: 0, bio: null });
    expect(document.getElementById('pf-recent-note').textContent).toBe('profile.history_hidden');
    expect(document.getElementById('pf-stats').children).toHaveLength(0);
    expect(document.getElementById('pf-stats-note').hidden).toBe(false);
    expect(document.getElementById('pf-wdl').hidden).toBe(true);
    expect(document.getElementById('pf-recent-tbl').hidden).toBe(true);
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

  it('puzzles: level → dots + solved count; no level → solved + unlock hint, no dots; nothing solved → section hidden', async () => {
    await boot({ ...PROFILE, puzzles: { solved: 12, level: 'medium', byLevel: {}, threshold: 10 } });
    const box = document.getElementById('pf-puzzle-box');
    expect(document.getElementById('pf-puzzles').hidden).toBe(false);
    expect(box.querySelector('.pf-skill__r').textContent).toBe('profile.puzzles_level_v{"level":"puzzles.level_medium"}12');
    expect([...box.querySelectorAll('.pf-dots i')].map((i) => i.className)).toEqual(['on', 'on', '', '']);
    await boot({ ...PROFILE, puzzles: { solved: 3, level: null, byLevel: {}, threshold: 10 } });
    expect(document.querySelector('#pf-puzzle-box .pf-dots')).toBeNull();
    expect(document.getElementById('pf-puzzle-box').textContent).toContain('profile.puzzles_level_hint{"n":10}');
    expect(document.getElementById('pf-org').hidden).toBe(false);
    await boot({ ...PROFILE, puzzles: { solved: 0, level: null, byLevel: {}, threshold: 10 } });
    expect(document.getElementById('pf-puzzles').hidden).toBe(true);
    await boot({ ...PROFILE });
    expect(document.getElementById('pf-puzzles').hidden).toBe(true);
  });

  it('renders badges and the win streak; nothing when there are none', async () => {
    await boot({ ...PROFILE, badges: ['first_win', 'top_500'], streak: { current: 2, best: 5 } });
    expect([...document.querySelectorAll('#pf-badges .pbadge')].map((b) => b.textContent)).toEqual(['badge.first_win', 'badge.top_500']);
    expect(document.getElementById('pf-badges-sec').hidden).toBe(false);
    // B213: two plain stats instead of "2 (cao nhất 5)", which wrapped on phones.
    const stat = (key) => [...document.querySelectorAll('#pf-stats > div')].find((d) => d.querySelector('dt').textContent === key);
    expect(stat('profile.streak').querySelector('dd').textContent).toBe('2');
    expect(stat('profile.streak_best').querySelector('dd').textContent).toBe('5');
    // Badges sit in the Thành tích section, each with an icon.
    const badges = [...document.querySelectorAll('#pf-badges-sec #pf-badges .pbadge')];
    expect(badges.map((b) => b.querySelector('use').getAttribute('href').split('#')[1])).toEqual(['ph-regular-flag-checkered', 'ph-regular-trophy']);
    await boot({ ...PROFILE, badges: [], streak: { current: 0, best: 0 } });
    expect(document.getElementById('pf-badges-sec').hidden).toBe(true);
    expect(document.getElementById('pf-stats').textContent).not.toContain('profile.streak');
    await boot({ ...PROFILE, streak: null });
    expect(document.getElementById('pf-stats').textContent).not.toContain('profile.streak');
  });

  describe('friend button', () => {
    const labels = () => [...document.querySelectorAll('#pf-social > button')].map((b) => b.textContent).filter((l) => l !== 'challenge.btn');
    const friendBtn = (label) => [...document.querySelectorAll('#pf-social > button')].find((b) => b.textContent === label);

    it.each([
      ['none', 'challenge.btn'],
      ['incoming', 'friends.accept'],
    ])('state %s: exactly one filled button (%s), Thách đấu first', async (friendship, filled) => {
      await boot({ ...PROFILE, friendship });
      expect([...document.querySelectorAll('#pf-social .pbtn--primary')].map((b) => b.textContent)).toEqual([filled]);
      expect(document.querySelector('#pf-social > button').textContent).toBe('challenge.btn');
    });

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

    it.each([
      ['none', [['friends.add', 'ph-regular-user-plus']]],
      ['outgoing', [['friends.cancel', 'ph-regular-x']]],
      ['incoming', [['friends.accept', 'ph-regular-check'], ['friends.decline', 'ph-regular-x']]],
      ['friends', [['friends.remove', 'ph-regular-user-minus']]],
    ])('state %s: every friend button carries its icon (B213)', async (friendship, expected) => {
      await boot({ ...PROFILE, friendship });
      const got = [...document.querySelectorAll('#pf-social > button')].filter((b) => b.textContent !== 'challenge.btn')
        .map((b) => [b.textContent, b.querySelector('use').getAttribute('href').split('#')[1]]);
      expect(got).toEqual(expected);
    });

    it('Liên hệ: username, place and joined date each lead with an icon (B213)', async () => {
      await boot({ ...PROFILE, friendship: 'none', city: 'Hà Nội' });
      const icons = [...document.querySelectorAll('#pf-joined > span use')].map((u) => u.getAttribute('href').split('#')[1]);
      expect(icons).toEqual(['ph-regular-user-circle', 'ph-regular-map-pin', 'ph-regular-calendar']);
      expect(document.querySelector('#pf-joined > span').textContent).toBe('@alice');
    });

    it('action buttons lead with an icon that matches them (B212)', async () => {
      await boot({ ...PROFILE, friendship: 'none' });
      const iconOf = (n) => n.querySelector('svg use').getAttribute('href').split('#')[1];
      const byText = (sel, txt) => [...document.querySelectorAll(sel)].find((n) => n.textContent === txt);
      expect(iconOf(byText('#pf-social > button', 'friends.add'))).toBe('ph-regular-user-plus');
      expect(iconOf(byText('#pf-social > button', 'challenge.btn'))).toBe('ph-regular-boxing-glove');
      expect(iconOf(byText('#pf-social > a', 'dm.btn'))).toBe('ph-regular-chat-circle');
    });

    describe('challenge (#222: modal with the player preselected)', () => {
      const openModal = async (fetchImpl) => {
        await boot({ ...PROFILE, friendship: 'none' });
        global.fetch = jest.fn(fetchImpl);
        [...document.querySelectorAll('#pf-social > button')].find((b) => b.textContent === 'challenge.btn').click();
        return document.querySelector('.pchal');
      };

      it('skips the friend picker: settings for this player straight away, no GET /api/friends', async () => {
        const m = await openModal(() => Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve({}) }));
        expect(m.querySelector('#pchal-title').textContent).toBe('challenge.modal_title' + JSON.stringify({ name: PROFILE.displayName }));
        expect(global.fetch).not.toHaveBeenCalled();
        m.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
        await flush(); await flush();
        const [url, opts] = global.fetch.mock.calls[0];
        expect(url).toBe('/api/challenges');
        expect(JSON.parse(opts.body)).toMatchObject({ to: 'alice', games: 1, stake: 'none', settings: { boardSize: 17, ranked: true } });
        expect(document.querySelector('.pchal')).toBeNull();
        expect(document.querySelector('#pf-social > .pnote').textContent).toBe('challenge.sent');
      });

      it('server refusal keeps the modal open and shows its message; 403 without one → members only', async () => {
        let m = await openModal(() => Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({ error: 'Hai bạn vừa đổi Elo' }) }));
        m.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
        await flush(); await flush();
        expect(m.querySelector('.pchal__status').textContent).toBe('Hai bạn vừa đổi Elo');
        expect(document.querySelector('.pchal')).toBe(m);
        m.remove();
        m = await openModal(() => Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) }));
        m.querySelector('form').dispatchEvent(new Event('submit', { cancelable: true }));
        await flush(); await flush();
        expect(m.querySelector('.pchal__status').textContent).toBe('challenge.members_only');
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
      friendBtn('friends.add').click();
      await flush(); await flush();
      expect(global.fetch).toHaveBeenCalledWith('/api/friends/alice', expect.objectContaining({ method: 'POST' }));
      expect(labels()).toEqual(['friends.cancel']);
      global.fetch = base;
    });

    it('accept posts to /accept; failure re-enables the button and reports', async () => {
      await boot({ ...PROFILE, friendship: 'incoming' });
      global.fetch = jest.fn(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
      friendBtn('friends.accept').click();
      await flush(); await flush();
      expect(global.fetch.mock.calls[0][0]).toBe('/api/friends/alice/accept');
      expect(friendBtn('friends.accept').disabled).toBe(false);
      expect(document.getElementById('pf-status').textContent).toBe('friends.error');
    });
  });

  describe('#403 CV sheet', () => {
    const R3 = [
      { category: 'freestyle', rating: 1811, rank: 3, games: 212, provisional: false, delta7: 54 },
      { category: 'standard', rating: 1742, rank: 12, games: 80, provisional: false, delta7: -8 },
      { category: 'caro', rating: 1655, rank: null, games: 9, provisional: true, delta7: 0 },
    ];

    it('fact strip uses the variant with the most games; side shows all three in CATEGORIES order with rank / games', async () => {
      await boot({ ...PROFILE, ratings: [R3[2], R3[1], R3[0]] });
      const facts = [...document.querySelectorAll('#pf-facts > div')].map((d) => [d.querySelector('dt').textContent, d.querySelector('dd').textContent]);
      expect(facts).toEqual([['profile.fact_main', 'rankings.cat_freestyle'], ['profile.fact_rank', '#3'], ['profile.fact_rating', '1811'], ['profile.fact_week', '+54']]);
      expect([...document.querySelectorAll('#pf-ratings .pf-skill__r span')].map((n) => n.textContent)).toEqual(['rankings.cat_freestyle', 'rankings.cat_standard', 'rankings.cat_caro']);
      expect([...document.querySelectorAll('#pf-ratings .pf-skill__m')].map((n) => n.textContent)).toEqual([
        'profile.rank{"rank":3}profile.games_n{"n":212}', 'profile.rank{"rank":12}profile.games_n{"n":80}', 'profile.provisional_hintprofile.games_n{"n":9}']);
      expect(document.getElementById('pf-tag').textContent).toBe('profile.tag_player{"cat":"rankings.cat_freestyle"}#3');
      // Level bar: clamped width, never 0 or over 100.
      const w = [...document.querySelectorAll('#pf-ratings .pf-lv i')].map((i) => parseFloat(i.style.width));
      expect(w).toEqual([61.1, 54.2, 45.5]);
    });

    it('unranked main variant: no Hạng fact, no rank tag; negative delta is marked down', async () => {
      await boot({ ...PROFILE, ratings: [{ category: 'caro', rating: 1500, rank: null, games: 4, provisional: false, delta7: -6 }] });
      expect(document.getElementById('pf-facts').textContent).not.toContain('profile.fact_rank');
      expect(document.querySelector('#pf-tag b')).toBeNull();
      expect(document.querySelector('#pf-facts .pf-delta.dn').textContent).toBe('-6');
      expect(document.querySelector('#pf-ratings .pf-skill__m span').textContent).toBe('profile.unranked_short');
    });

    it('no ratings: facts and tag hidden, side note shown', async () => {
      await boot({ ...PROFILE, ratings: [] });
      expect(document.getElementById('pf-facts').hidden).toBe(true);
      expect(document.getElementById('pf-tag').hidden).toBe(true);
      expect(document.getElementById('pf-ratings').textContent).toBe('profile.no_ratings');
    });

    it('Số liệu: 5 numbers with a streak, W/D/L bar widths add up and carry a text label', async () => {
      await boot({ ...PROFILE, stats: { games: 10, wins: 6, draws: 1 }, streak: { current: 2, best: 5 } });
      expect([...document.querySelectorAll('#pf-stats dd')].map((d) => d.textContent)).toEqual(['10', '60%', '1', '2', '5']);
      const bar = document.getElementById('pf-wdl');
      expect(bar.hidden).toBe(false);
      expect([...bar.children].map((i) => [i.className, i.style.width])).toEqual([['w', '60%'], ['d', '10%'], ['l', '30%']]);
      expect(bar.getAttribute('aria-label')).toBe('profile.wdl_aria{"w":6,"d":1,"l":3}');
      await boot({ ...PROFILE, stats: { games: 0, wins: 0, draws: 0 }, opponents: [], opponentTotal: 0 });
      expect(document.getElementById('pf-wdl').hidden).toBe(true);
      expect(document.getElementById('pf-recent-note').textContent).toBe('profile.no_recent');
    });

    it('#484 head-to-head table: opponent, wins, losses, draws', async () => {
      await boot(PROFILE);
      const cells = [...document.querySelectorAll('#pf-recent tr td')];
      expect(cells.map((c) => c.textContent)).toEqual(['bob', '6', '3', '1']);
      expect(cells[0].querySelector('button').getAttribute('aria-expanded')).toBe('false');
    });

    it('own profile: Sao chép liên kết copies the /u/ link and confirms', async () => {
      await boot({ ...PROFILE, isSelf: true });
      const writeText = jest.fn(() => Promise.resolve());
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
      document.getElementById('pf-copy').click();
      await flush();
      expect(writeText).toHaveBeenCalledWith('http://localhost/u/alice');
      expect(document.getElementById('pf-copy-note').textContent).toBe('profile.copied');
      writeText.mockImplementation(() => Promise.reject(new Error('denied')));
      document.getElementById('pf-copy').click();
      await flush();
      expect(document.getElementById('pf-copy-note').textContent).toBe('profile.copy_failed');
    });

    it('bio hidden note for the owner; empty bio for others shows nothing', async () => {
      await boot({ ...PROFILE, isSelf: true, bio: null, privacy: { hideBio: true } });
      expect(document.getElementById('pf-bio').textContent).toBe('profile.bio_hidden');
      await boot({ ...PROFILE, bio: null });
      expect(document.getElementById('pf-bio').textContent).toBe('');
    });
  });

  it('shows a not-found message', async () => {
    await boot(null, 404);
    expect(document.getElementById('pf-status').textContent).toBe('profile.not_found');
    expect(document.getElementById('pf-content').hidden).toBe(true);
  });

  describe('head-to-head (#484)', () => {
    const game = (id) => ({ id, opponent: 'bob', result: 'loss', endedAt: '2026-10-02T00:00:00.000Z' });
    const reply = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    const settle = async () => { await flush(); await flush(); };
    const hrefs = () => [...document.querySelectorAll('#pf-recent a')].map((a) => a.getAttribute('href'));
    const gameCalls = () => global.fetch.mock.calls.map((c) => String(c[0])).filter((u) => u.includes('/games?'));

    it('click lazily loads that opponent\'s games, pages, collapses and reopens without refetching', async () => {
      await boot(PROFILE);
      expect(gameCalls()).toEqual([]);
      global.fetch.mockImplementation((u) => reply(String(u).includes('page=2')
        ? { games: [game('g2')], pagination: { page: 2, totalPages: 2 } }
        : { games: [game('g1')], pagination: { page: 1, totalPages: 2 } }));
      const btn = document.querySelector('.pf-opp__btn');
      btn.click(); await settle();
      expect(gameCalls()).toEqual(['/api/profile/alice/games?vs=bobby&page=1']);
      expect(btn.getAttribute('aria-expanded')).toBe('true');
      expect(hrefs()).toEqual(['/replay/g1']);
      document.querySelector('.pf-game-more button').click(); await settle();
      expect(hrefs()).toEqual(['/replay/g1', '/replay/g2']);
      expect(document.querySelector('.pf-game-more')).toBeNull();
      btn.click();
      expect(hrefs()).toEqual([]);
      btn.closest('tr').querySelector('td:last-child').click(); await settle(); // anywhere on the row
      expect(hrefs()).toEqual(['/replay/g1', '/replay/g2']);
      expect(gameCalls()).toHaveLength(2);
    });

    it('a guest opponent is asked for by name; a failed load leaves the row closed for retry', async () => {
      await boot({ ...PROFILE, opponents: [{ name: 'Khách 1', username: null, games: 1, wins: 0, losses: 1, draws: 0 }] });
      global.fetch.mockImplementation(() => Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) }));
      const btn = document.querySelector('.pf-opp__btn');
      btn.click(); await settle();
      expect(gameCalls()).toEqual(['/api/profile/alice/games?guest=' + encodeURIComponent('Khách 1') + '&page=1']);
      expect(btn.getAttribute('aria-expanded')).toBe('false');
    });

    it('"load more" appears only when more opponents exist and appends the next page', async () => {
      await boot(PROFILE);
      expect(document.getElementById('pf-more').hidden).toBe(true);
      await boot({ ...PROFILE, opponentTotal: 2 });
      expect(document.getElementById('pf-more').hidden).toBe(false);
      global.fetch.mockImplementation(() => reply({ opponents: [{ name: 'cy', username: 'cy', games: 1, wins: 1, losses: 0, draws: 0 }], pagination: { page: 2, totalPages: 2 } }));
      document.getElementById('pf-more').click(); await settle();
      expect([...document.querySelectorAll('.pf-opp__btn')].map((b) => b.textContent)).toEqual(['bob', 'cy']);
      expect(global.fetch.mock.calls.at(-1)[0]).toBe('/api/profile/alice/opponents?page=2');
      expect(document.getElementById('pf-more').hidden).toBe(true);
    });
  });
});

// Last on purpose: boot() leaves its DOMContentLoaded listener behind, which would fire in later tests.
describe('profile page without a username (#272)', () => {
  it('#272 /profile.html without /u/<name> never calls the profile API', async () => {
    await boot(PROFILE, 200, '/profile.html');
    expect(global.fetch.mock.calls.some((c) => String(c[0]).includes('/api/profile'))).toBe(false);
    expect(document.getElementById('pf-status').textContent).toBe('');
  });
});
