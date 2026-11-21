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
  const CATEGORIES = ['freestyle', 'standard', 'caro', 'renju'];

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  const SHELL = () => window.PlatformShell;
  /** Leading sprite icon on an action button (B212); profile actions all carry one (B213). */
  const BADGE_ICONS = { first_win: 'ph-regular-flag-checkered', wins_100: 'ph-regular-medal', wins_1000: 'ph-regular-medal', top_500: 'ph-regular-trophy', top_10: 'ph-regular-trophy' };
  // Lower tier is hidden when its higher tier is earned (B342).
  const BADGE_SUPERSEDED_BY = { top_500: ['top_10'], wins_100: ['wins_1000'] };
  const withIcon = (node, name) => { if (name) node.prepend(SHELL().icon(name)); return node; };

  function setAvatar(url, name) {
    $('pf-avatar').replaceWith(Object.assign(SHELL().avatar(url, name, 'pav--xl pf-av'), { id: 'pf-avatar' }));
  }

  const lang = () => document.documentElement.lang || undefined;
  /** Level bar width (visual only): 1200 → 8 %, 2200+ → 100 %. */
  const level = (r) => Math.max(8, Math.min(100, ((r - 1200) / 1000) * 100));
  const PUZZLE_LEVELS = ['easy', 'medium', 'hard', 'expert'];
  const fmtDelta = (d) => (d > 0 ? '+' + d : String(d));

  /** "Thể loại chính" = the variant with the most rated games (ties: CATEGORIES order). */
  function mainRating(ratings) {
    let best = null;
    for (const c of CATEGORIES) {
      const r = ratings.find((x) => x.category === c);
      if (r && (!best || r.games > best.games)) best = r;
    }
    return best;
  }

  function fact(label, value, cls) {
    const d = document.createElement('div');
    d.append(el('dt', label), el('dd', value, cls));
    return d;
  }

  function renderSide(p, main) {
    $('pf-side-name').textContent = p.displayName;
    const tag = $('pf-tag');
    tag.replaceChildren();
    tag.hidden = !main;
    if (main) {
      tag.append(el('span', t('profile.tag_player', { cat: t('rankings.cat_' + main.category) })));
      if (main.rank) tag.append(el('b', '#' + main.rank, 'num'));
    }

    const country = p.country && window.Countries ? window.Countries.name(p.country, lang() || 'vi') : '';
    const where = [p.city, country].filter(Boolean).join(', ');
    const joined = t('profile.joined', { date: new Date(p.createdAt).toLocaleDateString(undefined, { month: '2-digit', year: 'numeric' }) });
    $('pf-joined').replaceChildren(
      withIcon(el('span', '@' + p.username, 'pf-ell'), 'ph-regular-user-circle'),
      ...(where ? [withIcon(el('span', where, 'pf-ell'), 'ph-regular-map-pin')] : []),
      withIcon(el('span', joined), 'ph-regular-calendar'));

    const box = $('pf-ratings');
    box.setAttribute('aria-label', t('profile.ratings'));
    box.replaceChildren();
    if (!p.ratings.length) box.appendChild(el('p', t('profile.no_ratings'), 'pf-side-note'));
    let i = 0;
    for (const c of CATEGORIES) {
      const r = p.ratings.find((x) => x.category === c);
      if (!r) continue;
      const item = el('div', undefined, 'pf-skill');
      const head = el('div', undefined, 'pf-skill__r');
      head.append(el('span', t('rankings.cat_' + c)), el('b', String(r.rating) + (r.provisional ? '?' : ''), 'num'));
      const bar = el('div', undefined, 'pf-lv');
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', t('rankings.cat_' + c) + ' ' + r.rating);
      const fill = el('i');
      fill.style.width = level(r.rating) + '%';
      fill.style.setProperty('--i', String(i++));
      bar.appendChild(fill);
      const foot = el('small', undefined, 'pf-skill__m');
      const where = r.provisional ? t('profile.provisional_hint') : r.rank ? t('profile.rank', { rank: r.rank }) : t('profile.unranked_short');
      foot.append(el('span', where, r.provisional ? 'pprov' : undefined), el('span', t('profile.games_n', { n: r.games }), 'num'));
      item.append(head, bar, foot);
      box.appendChild(item);
    }
  }

  function renderFacts(main) {
    const dl = $('pf-facts');
    dl.replaceChildren();
    dl.hidden = !main;
    if (!main) return;
    dl.append(fact(t('profile.fact_main'), t('rankings.cat_' + main.category)));
    if (main.rank) dl.append(fact(t('profile.fact_rank'), '#' + main.rank, 'num'));
    dl.append(fact(t('profile.fact_rating'), String(main.rating) + (main.provisional ? '?' : ''), 'num'));
    if (main.delta7) {
      dl.append(fact(t('profile.fact_week'), fmtDelta(main.delta7), 'num pf-delta ' + (main.delta7 > 0 ? 'up' : 'dn')));
    }
  }

  function renderStats(p) {
    const nums = $('pf-stats');
    const note = $('pf-stats-note');
    const wdl = $('pf-wdl');
    nums.replaceChildren();
    wdl.replaceChildren();
    wdl.hidden = true;
    note.hidden = !!p.stats;
    if (!p.stats) { note.textContent = t('profile.history_hidden'); return; }
    const s = p.stats;
    const pct = s.games ? Math.round((s.wins / s.games) * 100) + '%' : '—';
    const add = (label, v) => { const d = document.createElement('div'); d.append(el('dd', v, 'num'), el('dt', t('profile.' + label))); nums.appendChild(d); };
    add('stats_games', String(s.games));
    add('win_rate', pct);
    add('stats_draws', String(s.draws));
    if (p.streak && p.streak.best > 0) {
      // Two plain numbers, not "3 (cao nhất 4)" (B213).
      add('streak', String(p.streak.current));
      add('streak_best', String(p.streak.best));
    }
    if (s.games > 0) {
      const losses = Math.max(0, s.games - s.wins - s.draws);
      for (const [cls, n] of [['w', s.wins], ['d', s.draws], ['l', losses]]) {
        const seg = el('i', undefined, cls);
        seg.style.width = (n / s.games) * 100 + '%';
        wdl.appendChild(seg);
      }
      wdl.setAttribute('aria-label', t('profile.wdl_aria', { w: s.wins, d: s.draws, l: losses }));
      wdl.hidden = false;
    }
  }

  function renderBadges(p) {
    const box = $('pf-badges');
    box.replaceChildren();
    // Display filter only (B342): a higher tier in the same family makes the lower one redundant.
    const shown = (p.badges || []).filter((id) => !(BADGE_SUPERSEDED_BY[id] || []).some((hi) => (p.badges || []).includes(hi)));
    for (const id of shown) {
      const item = withIcon(el('div', undefined, 'pbadge'), BADGE_ICONS[id] || 'ph-regular-medal');
      item.appendChild(el('b', t('badge.' + id)));
      box.appendChild(item);
    }
    $('pf-badges-sec').hidden = !shown.length;
  }

  function renderOrg(p) {
    // Puzzle record (7b): public, shown once the member has solved anything. No level → no dots.
    const pz = p.puzzles && p.puzzles.solved > 0 ? p.puzzles : null;
    const box = $('pf-puzzle-box');
    box.replaceChildren();
    $('pf-puzzles').hidden = !pz;
    if (pz) {
      const row = el('div', undefined, 'pf-skill__r');
      row.append(el('span', pz.level ? t('profile.puzzles_level_v', { level: t('puzzles.level_' + pz.level) }) : t('profile.puzzles_solved')),
        el('b', String(pz.solved), 'num'));
      box.appendChild(row);
      const idx = PUZZLE_LEVELS.indexOf(pz.level);
      if (idx >= 0) {
        const dots = el('div', undefined, 'pf-dots');
        dots.setAttribute('role', 'img');
        dots.setAttribute('aria-label', t('profile.puzzles_level_v', { level: t('puzzles.level_' + pz.level) }));
        PUZZLE_LEVELS.forEach((_, i) => dots.appendChild(el('i', undefined, i <= idx ? 'on' : '')));
        box.append(dots, el('small', t('profile.puzzles_solved'), 'pf-side-note'));
      } else {
        const hint = el('small', t('profile.puzzles_level_hint', { n: pz.threshold }), 'pf-side-note');
        box.appendChild(hint);
      }
    }

    const clubs = p.clubs || [];
    $('pf-clubs-panel').hidden = clubs.length === 0;
    $('pf-clubs').replaceChildren(...clubs.map((c) => {
      const a = el('a', undefined, 'pf-club');
      a.href = '/c/' + encodeURIComponent(c.slug);
      const body = el('span', undefined, 'pf-club__b');
      body.append(el('span', c.name, 'pf-ell pf-club__n'), el('small', t('clubs.role_' + c.role)));
      const cnt = el('span', String(c.members), 'pf-club__cnt num');
      cnt.title = t('clubs.members', { n: c.members });
      a.append(SHELL().avatar(c.avatarUrl, c.name, 'pav--sq pf-club__av'), body, cnt);
      return a;
    }));
    $('pf-org').hidden = !pz && clubs.length === 0;
  }

  function render(p) {
    document.title = 'Play3CR — ' + p.displayName;
    $('pf-name').textContent = p.displayName;
    setAvatar(p.avatarUrl, p.displayName);
    const main = mainRating(p.ratings);
    renderSide(p, main);
    renderFacts(main);

    const bio = $('pf-bio');
    if (p.bio) bio.textContent = p.bio;
    else bio.textContent = p.isSelf && p.privacy && p.privacy.hideBio ? t('profile.bio_hidden') : (p.bio === null ? '' : t('profile.no_bio'));
    bio.classList.toggle('pnote', !p.bio);
    $('pf-actions').hidden = !p.isSelf;
    if (p.isSelf && SHELL().setActive) SHELL().setActive('me'); // mockup: Tôi is active on the viewer's own profile
    renderSocial(p);
    renderStats(p);
    renderBadges(p);
    renderOrg(p);

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
    $('pf-recent-tbl').hidden = !p.recent.length;
    $('pf-ref').hidden = !p.recent.length;
    gamesPage = 1;
    // Show the button only when more finished games exist than the first page carried.
    $('pf-more').hidden = !p.stats || p.stats.games <= p.recent.length;
    if (p.stats) $('pf-more-label').textContent = t('profile.load_all', { n: p.stats.games });

    $('pf-content').hidden = false;
    drawChart(p);
    if (location.hash === '#games') $('pf-games').scrollIntoView();
  }

  let gamesPage = 1;

  /** One table row per game: Ngày, Đối thủ (link to the replay, stretched over the row), Kết quả (text + colour). */
  function gameRow(g) {
    const tr = el('tr', undefined, 'pf-game');
    const when = g.endedAt ? new Date(g.endedAt).toLocaleDateString(lang(), { day: '2-digit', month: '2-digit' }) : '';
    const opp = el('td', undefined, 'pf-game__o');
    const a = el('a', g.opponent, 'pf-ell');
    a.href = '/replay/' + encodeURIComponent(g.id);
    opp.appendChild(a);
    tr.append(el('td', when, 'num'), opp, el('td', t('profile.' + g.result), 'pf-res pf-res--' + g.result));
    return tr;
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
    const mk = (key, method, path, cls, iconName) => {
      const b = withIcon(el('button', t(key), 'pbtn' + (cls ? ' ' + cls : '')), iconName);
      b.type = 'button';
      b.addEventListener('click', () => friendAction(p, method, path, b));
      return b;
    };
    const base = '/api/friends/' + encodeURIComponent(p.username);
    switch (p.friendship) {
      case 'friends':
        box.append(el('span', t('friends.is_friend'), 'pnote'), mk('friends.remove', 'DELETE', base, 'pbtn--ghost', 'ph-regular-user-minus'));
        break;
      case 'outgoing':
        box.append(el('span', t('friends.sent'), 'pnote'), mk('friends.cancel', 'DELETE', base, 'pbtn--ghost', 'ph-regular-x'));
        break;
      case 'incoming':
        box.append(mk('friends.accept', 'POST', base + '/accept', 'pbtn--primary', 'ph-regular-check'), mk('friends.decline', 'DELETE', base, 'pbtn--ghost', 'ph-regular-x'));
        break;
      default:
        if (!p.can || p.can.friend) box.append(mk('friends.add', 'POST', base, '', 'ph-regular-user-plus'));
        else box.append(el('span', t('privacy.no_friend'), 'pnote'));
    }
    challengeControls(p, box);
  }

  /** "Thách đấu" button → ChallengeModal with this player preselected (#222: full rules, series, stake). */
  function challengeControls(p, box) {
    // One filled button only (DESIGN.md Hồ sơ): Thách đấu, unless an incoming request's Đồng ý already is.
    const open = withIcon(el('button', t('challenge.btn'), 'pbtn' + (p.friendship === 'incoming' ? '' : ' pbtn--primary')), 'ph-regular-boxing-glove');
    open.type = 'button';
    const note = el('span', '', 'pnote');
    open.addEventListener('click', () => {
      note.textContent = '';
      window.ChallengeModal.open({
        to: { username: p.username, displayName: p.displayName, avatarUrl: p.avatarUrl },
        onSent: () => { note.textContent = t('challenge.sent'); },
      });
    });
    const msg = withIcon(el('a', t('dm.btn'), 'pbtn'), 'ph-regular-chat-circle');
    msg.href = '/social.html#dm=' + encodeURIComponent(p.username);
    const can = p.can || { dm: true, challenge: true };
    if (can.challenge) box.prepend(open);
    else box.append(el('span', t('privacy.no_challenge'), 'pnote'));
    if (can.dm) box.append(msg);
    else box.append(el('span', t('privacy.no_dm'), 'pnote'));
    if (can.challenge) box.append(note);
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
    if (!cats.length) { note.textContent = t('profile.no_ratings'); return; }
    if (!cats.includes(chart.category)) chart.category = cats[0];
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
    svg.setAttribute('aria-label', t('profile.chart_title') + ' ' + t('rankings.cat_' + chart.category));
    svg.removeAttribute('hidden');
    note.textContent = t('profile.chart_caption', { days: chart.days, peak: h.peak });
  }

  /** Own profile: copy the public /u/<name> link (kept from PF7, user 2026-11-16). */
  async function copyLink() {
    const note = $('pf-copy-note');
    try {
      await navigator.clipboard.writeText(location.origin + '/u/' + encodeURIComponent(username));
      note.textContent = t('profile.copied');
    } catch (_) {
      note.textContent = t('profile.copy_failed');
    }
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
    // /profile.html has no /u/<name> segment: nothing to fetch (#272).
    if (!/^\/u\/./.test(location.pathname)) { location.replace('/'); return; }
    SHELL().build(null);
    $('pf-more').onclick = loadMoreGames;
    $('pf-copy').onclick = copyLink;
    load();
  });
})();
