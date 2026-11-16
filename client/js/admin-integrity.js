/**
 * admin-integrity.js — "Toàn vẹn xếp hạng" tab of /admin (#249). GET /api/admin/rating-integrity
 * (perm cheat.review): read-only collusion signals from the ranked-game graph. Never changes a rating.
 * Exposes window.AdminIntegrity.init().
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  let started = false;

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  const pct = (x) => Math.round(x * 100);

  function card(title, badges, detail) {
    const box = el('div', undefined, 'prow ri-card');
    const body = el('div', undefined, 'prow__body');
    body.append(el('b', title, 'prow__t'), el('p', detail, 'prow__m'));
    const tags = el('div', undefined, 'us-row__badges');
    tags.append(...badges.map((x) => el('span', x, 'pbadge')));
    box.append(body);
    if (badges.length) box.append(tags);
    return box;
  }
  const context = (friends, club) => [friends && t('admin.i_friends'), club && t('admin.i_club')].filter(Boolean);

  function section(title, items) {
    const wrap = el('section', undefined, 'ri-sec');
    const head = el('h3', undefined, 'ri-sec__h');
    head.append(el('span', title), el('span', String(items.length), 'pbadge ri-sec__n' + (items.length ? ' is-hot' : '')));
    wrap.append(head);
    const list = el('div', undefined, 'prows prows--tickets');
    if (items.length) list.append(...items); else list.append(el('p', t('admin.i_empty'), 'pnote'));
    wrap.append(list);
    return wrap;
  }

  function render(d) {
    $('ri-hint').textContent = t('admin.i_hint', { n: d.population }) + (d.activePlayers < d.thresholds.POP_MIN ? ' ' + t('admin.i_sparse', { n: d.thresholds.POP_MIN, min: d.thresholds.MIN_GAMES, active: d.activePlayers }) : '');
    const players = d.players.map((p) => card(p.displayName,
      [...p.flags.map((f) => t('admin.i_flag_' + f)), ...context(p.topOpponentFriend, p.topOpponentSameClub)],
      t('admin.i_player', { games: p.games, eff: p.effectiveOpponents, uniq: p.uniqueOpponents, share: pct(p.topGainShare), top: p.topOpponentName || '?' })));
    const pairs = d.pairs.map((p) => card(p.aName + ' – ' + p.bName, [p.weakerWins && t('admin.i_weaker'), ...context(p.friends, p.sameClub)].filter(Boolean),
      t('admin.i_pair', { games: p.games, a: p.aName, aw: p.aWins, b: p.bName, bw: p.bWins, z: p.z })));
    const groups = d.groups.map((g) => card(g.names.join(', '), [], t('admin.i_group', { games: g.games, share: pct(g.internalShare) })));
    if (window.IntegrityViz) window.IntegrityViz.render($('ri-viz'), d.viz);
    $('ri-list').replaceChildren(section(t('admin.i_players'), players), section(t('admin.i_pairs'), pairs), section(t('admin.i_groups'), groups));
  }

  async function load() {
    const msg = $('ri-msg');
    try {
      const res = await fetch('/api/admin/rating-integrity', { credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { msg.hidden = false; msg.textContent = data.code ? t('err.' + data.code.toLowerCase()) : t('admin.error'); return; }
      msg.hidden = true;
      render(data);
    } catch (err) {
      msg.hidden = false;
      msg.textContent = t('admin.error');
    }
  }

  window.AdminIntegrity = { init() { if (!started) { started = true; load(); } } };
})();
