/**
 * profile.js — /u/<username> page (#177).
 *
 * GET /api/profile/:username renders the page; the owner gets an "edit" link to
 * /settings.html (settings.js owns editing since #199). All user-supplied text goes
 * through textContent; the avatar is a same-origin image URL.
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);

  const username = decodeURIComponent(location.pathname.replace(/^\/u\//, '').replace(/\/$/, ''));
  const CATEGORIES = ['freestyle', 'standard', 'caro'];

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  const SHELL = () => window.PlatformShell;

  function setAvatar(url, name) {
    $('pf-avatar').replaceWith(Object.assign(SHELL().avatar(url, name, 'pav--xl'), { id: 'pf-avatar' }));
  }

  function render(p) {
    document.title = 'Play3CR — ' + p.displayName;
    $('pf-name').textContent = p.displayName;
    $('pf-joined').textContent = t('profile.joined', {
      date: new Date(p.createdAt).toLocaleDateString(undefined, { month: '2-digit', year: 'numeric' }),
    });
    const country = p.country && window.Countries ? window.Countries.name(p.country, document.documentElement.lang || 'vi') : '';
    const where = [p.city, country].filter(Boolean).join(', ');
    if (where) $('pf-joined').textContent += ' · ' + where;
    setAvatar(p.avatarUrl, p.displayName);

    const bio = $('pf-bio');
    if (p.bio) bio.textContent = p.bio;
    else bio.textContent = p.isSelf && p.privacy && p.privacy.hideBio ? t('profile.bio_hidden') : (p.bio === null ? '' : t('profile.no_bio'));
    $('pf-actions').hidden = !p.isSelf;
    if (p.isSelf && SHELL().setActive) SHELL().setActive('me'); // mockup: Tôi is active on the viewer's own profile
    renderSocial(p);

    const stats = $('pf-stats');
    stats.replaceChildren();
    if (p.stats) {
      const pct = p.stats.games ? Math.round((p.stats.wins / p.stats.games) * 100) + '%' : '—';
      for (const [label, v] of [['stats_games', String(p.stats.games)], ['win_rate', pct], ['stats_draws', String(p.stats.draws)]]) {
        const d = document.createElement('div');
        d.append(el('dt', t('profile.' + label)), el('dd', v));
        stats.appendChild(d);
      }
    }

    const badgeBox = $('pf-badges');
    badgeBox.replaceChildren();
    for (const id of p.badges || []) badgeBox.appendChild(el('span', t('badge.' + id), 'pbadge'));
    badgeBox.hidden = !badgeBox.childElementCount;
    if (p.streak && (p.streak.best > 0)) {
      const d = document.createElement('div');
      d.append(el('dt', t('profile.streak')), el('dd', t('profile.streak_val', { cur: p.streak.current, best: p.streak.best })));
      stats.appendChild(d);
    }
    // Puzzle record (7b): public, shown once the member has solved anything.
    if (p.puzzles && p.puzzles.solved > 0) {
      const lv = p.puzzles.level ? t('puzzles.level_' + p.puzzles.level) : '—';
      for (const [label, v] of [['puzzles_solved', String(p.puzzles.solved)], ['puzzles_level', lv]]) {
        const d = document.createElement('div');
        d.append(el('dt', t('profile.' + label)), el('dd', v));
        if (label === 'puzzles_level' && !p.puzzles.level) d.title = t('profile.puzzles_level_hint', { n: p.puzzles.threshold });
        stats.appendChild(d);
      }
    }

    const cards = $('pf-ratings');
    cards.replaceChildren();
    if (!p.ratings.length) cards.appendChild(el('p', t('profile.no_ratings'), 'pnote'));
    for (const c of CATEGORIES) {
      const r = p.ratings.find((x) => x.category === c);
      if (!r) continue;
      const card = el('div', undefined, 'pcard');
      card.append(
        el('span', t('rankings.cat_' + c)),
        el('b', String(r.rating) + (r.provisional ? '?' : '')),
        el('small', r.rank ? t('profile.rank', { rank: r.rank }) : t('profile.unranked', { games: r.games }))
      );
      if (r.delta7 != null) {
        card.appendChild(el('small', t('profile.delta_week', { n: r.delta7 > 0 ? '+' + r.delta7 : String(r.delta7) }), r.delta7 > 0 ? 'up' : r.delta7 < 0 ? 'dn' : ''));
      }
      cards.appendChild(card);
    }

    const list = $('pf-recent');
    const note = $('pf-recent-note');
    list.replaceChildren();
    note.hidden = true;
    if (!p.stats) {
      note.hidden = false;
      note.textContent = t('profile.history_hidden');
    } else if (!p.recent.length) {
      note.hidden = false;
      note.textContent = t('profile.no_recent');
    }
    list.append(...p.recent.map(gameRow));
    gamesPage = 1;
    // Show the button only when more finished games exist than the first page carried.
    $('pf-more').hidden = !p.stats || p.stats.games <= p.recent.length;

    const clubs = p.clubs || [];
    $('pf-clubs-panel').hidden = clubs.length === 0;
    $('pf-clubs').replaceChildren(...clubs.map((c) => {
      const a = el('a', undefined, 'prow');
      a.href = '/c/' + encodeURIComponent(c.slug);
      const body = el('div', undefined, 'prow__body');
      body.append(el('div', c.name, 'prow__t'), el('div', t('clubs.role_' + c.role) + ' · ' + t('clubs.members', { n: c.members }), 'prow__m'));
      a.append(SHELL().avatar(null, c.name, 'pav--sm pav--sq'), body);
      return a;
    }));

    $('pf-content').hidden = false;
    drawChart(p);
    if (location.hash === '#games') $('pf-games').scrollIntoView();
  }

  let gamesPage = 1;

  function gameRow(g) {
    const a = el('a', undefined, 'prow');
    a.href = '/replay/' + encodeURIComponent(g.id);
    const body = el('div', undefined, 'prow__body');
    const when = g.endedAt ? new Date(g.endedAt).toLocaleDateString(document.documentElement.lang || undefined) : '';
    body.append(el('div', t('profile.' + g.result) + ' vs ' + g.opponent, 'prow__t'));
    if (when) body.append(el('div', when, 'prow__m'));
    a.append(el('span', undefined, 'pdot' + (g.result === 'win' ? ' pdot--on' : g.result === 'loss' ? ' pdot--loss' : '')), body);
    return a;
  }

  async function loadMoreGames() {
    const btn = $('pf-more');
    btn.disabled = true;
    try {
      const res = await fetch('/api/profile/' + encodeURIComponent(username) + '/games?page=' + (gamesPage + 1), { credentials: 'same-origin' });
      if (!res.ok) return;
      const { games, pagination } = await res.json();
      $('pf-recent').append(...games.map(gameRow));
      gamesPage = pagination.page;
      btn.hidden = pagination.page >= pagination.totalPages;
    } catch (_) { /* button stays; user can retry */ } finally { btn.disabled = false; }
  }

  /** Friend button(s) on someone else's profile; state comes from p.friendship. */
  function renderSocial(p) {
    const box = $('pf-social');
    box.replaceChildren();
    box.hidden = p.isSelf;
    if (p.isSelf) return;
    const mk = (key, method, path, cls) => {
      const b = el('button', t(key), 'pbtn' + (cls ? ' ' + cls : ''));
      b.type = 'button';
      b.addEventListener('click', () => friendAction(p, method, path, b));
      return b;
    };
    const base = '/api/friends/' + encodeURIComponent(p.username);
    switch (p.friendship) {
      case 'friends':
        box.append(el('span', t('friends.is_friend'), 'pnote'), mk('friends.remove', 'DELETE', base, 'pbtn--ghost'));
        break;
      case 'outgoing':
        box.append(el('span', t('friends.sent'), 'pnote'), mk('friends.cancel', 'DELETE', base, 'pbtn--ghost'));
        break;
      case 'incoming':
        box.append(mk('friends.accept', 'POST', base + '/accept', 'pbtn--primary'), mk('friends.decline', 'DELETE', base, 'pbtn--ghost'));
        break;
      default:
        if (!p.can || p.can.friend) box.append(mk('friends.add', 'POST', base, 'pbtn--primary'));
        else box.append(el('span', t('privacy.no_friend'), 'pnote'));
    }
    challengeControls(p, box);
  }

  const RULES = ['freestyle', 'standard', 'caro'];
  const TIMES = ['1+0', '3+2', '5+3', '10+0'];

  /** "Thách đấu" button + inline form (rule × clock × rated); POST /api/challenges. */
  function challengeControls(p, box) {
    const open = el('button', t('challenge.btn'), 'pbtn');
    open.type = 'button';
    const form = el('form', undefined, 'pchallenge');
    form.hidden = true;
    const pick = (name, values, label) => {
      const sel = el('select');
      sel.name = name;
      sel.setAttribute('aria-label', t(label));
      for (const v of values) sel.appendChild(Object.assign(el('option', name === 'rule' ? t('rankings.cat_' + v) : v), { value: v }));
      return sel;
    };
    const rule = pick('rule', RULES, 'challenge.rule');
    const time = pick('time', TIMES, 'challenge.time');
    const ratedLabel = el('label', undefined, 'pchallenge__rated');
    const rated = el('input');
    rated.type = 'checkbox';
    ratedLabel.append(rated, ' ' + t('challenge.rated'));
    const go = el('button', t('challenge.send'), 'pbtn pbtn--primary');
    go.type = 'submit';
    const note = el('span', '', 'pnote');
    form.append(rule, time, ratedLabel, go, note);
    open.addEventListener('click', () => { form.hidden = !form.hidden; });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      go.disabled = true;
      try {
        const res = await fetch('/api/challenges', {
          method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: p.username, rule: rule.value, time: time.value, rated: rated.checked }),
        });
        if (res.status === 401) { location.href = '/login.html'; return; }
        if (res.status === 403) { note.textContent = t('challenge.members_only'); return; }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        note.textContent = t('challenge.sent');
      } catch (_) {
        note.textContent = t('friends.error');
      } finally {
        go.disabled = false;
      }
    });
    const msg = el('a', t('dm.btn'), 'pbtn');
    msg.href = '/social.html#dm=' + encodeURIComponent(p.username);
    const can = p.can || { dm: true, challenge: true };
    if (can.challenge) box.append(open, form);
    else box.append(el('span', t('privacy.no_challenge'), 'pnote'));
    if (can.dm) box.append(msg);
    else box.append(el('span', t('privacy.no_dm'), 'pnote'));
  }

  async function friendAction(p, method, path, btn) {
    btn.disabled = true;
    try {
      const res = await fetch(path, { method, credentials: 'same-origin' });
      if (res.status === 401) { location.href = '/login.html'; return; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      p.friendship = (await res.json()).status;
      renderSocial(p);
    } catch (_) {
      btn.disabled = false;
      $('pf-status').textContent = t('friends.error');
    }
  }

  const chart = { category: null, days: 90 };

  /** Rating curve for one variant; chips switch between the variants the player has rated. */
  async function drawChart(p) {
    const cats = CATEGORIES.filter((c) => p.ratings.some((r) => r.category === c));
    const tabs = $('pf-chart-tabs');
    const svg = $('pf-chart');
    const note = $('pf-chart-note');
    tabs.replaceChildren();
    svg.setAttribute('hidden', ''); // SVG elements have no .hidden property — use the attribute
    note.textContent = '';
    $('pf-chart-title').textContent = t('profile.chart_title', { cat: '' }).replace(/\s*·\s*$/, '');
    if (!cats.length) { note.textContent = t('profile.no_ratings'); return; }
    if (!cats.includes(chart.category)) chart.category = cats[0];
    $('pf-chart-title').textContent = t('profile.chart_title', { cat: t('rankings.cat_' + chart.category) });
    tabs.replaceChildren(...cats.map((c) => {
      const b = el('button', t('rankings.cat_' + c), 'pchip');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(c === chart.category));
      b.onclick = () => { chart.category = c; drawChart(p); };
      return b;
    }));
    let h;
    try {
      const res = await fetch('/api/profile/' + encodeURIComponent(username) + '/rating-history?category=' + chart.category + '&days=' + chart.days, { credentials: 'same-origin' });
      if (!res.ok) return;
      h = await res.json();
    } catch (_) { return; }
    if (!h || !Array.isArray(h.points)) return;
    if (h.hidden) { note.textContent = t('profile.chart_hidden'); return; }
    if (h.points.length < 2) { note.textContent = t('profile.chart_empty', { days: chart.days }); return; }
    const vals = h.points.map((x) => x.rating);
    const lo = Math.min(...vals);
    const span = Math.max(...vals) - lo || 1;
    const coords = vals.map((v, i) => (i / (vals.length - 1)) * 400 + ',' + (110 - ((v - lo) / span) * 100)).join(' ');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    line.setAttribute('points', coords);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', 'currentColor');
    line.setAttribute('stroke-width', '1.6');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.replaceChildren(line);
    svg.setAttribute('aria-label', t('profile.chart_title', { cat: t('rankings.cat_' + chart.category) }));
    svg.removeAttribute('hidden');
    note.textContent = t('profile.chart_caption', { days: chart.days, peak: h.peak });
  }

  async function load() {
    const status = $('pf-status');
    try {
      const res = await fetch('/api/profile/' + encodeURIComponent(username), { credentials: 'same-origin' });
      if (res.status === 404) { status.textContent = t('profile.not_found'); return; }
      if (!res.ok) throw new Error('HTTP ' + res.status);
      status.textContent = '';
      render(await res.json());
    } catch (_) {
      status.textContent = t('profile.error');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    SHELL().build(null);
    $('pf-more').onclick = loadMoreGames;
    load();
  });
})();
