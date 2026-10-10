/**
 * puzzles.js — puzzle list (#203 7a-2). GET /api/puzzles?tag=&level=&rule=&page= (approved only);
 * filters live in the query string. All server text goes through textContent.
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const LEVELS = ['easy', 'medium', 'hard', 'expert'];
  const RULES = ['freestyle', 'standard', 'caro'];
  const TAGS = ['three', 'four_three', 'vcf', 'vct', 'defense', 'trap'];

  const levelsEl = document.getElementById('pz-levels');
  const rulesEl = document.getElementById('pz-rules');
  const tagsEl = document.getElementById('pz-tags');
  const listEl = document.getElementById('pz-list');
  const emptyEl = document.getElementById('pz-empty');
  const totalEl = document.getElementById('pz-total');
  const pagerEl = document.getElementById('pz-pager');

  const params = new URLSearchParams(location.search);
  const pick = (name, allowed) => (allowed.includes(params.get(name)) ? params.get(name) : '');
  const state = {
    level: pick('level', LEVELS),
    rule: pick('rule', RULES),
    tag: pick('tag', TAGS),
    page: Math.max(1, parseInt(params.get('page'), 10) || 1),
  };

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  /** A row of toggle chips for one filter; clicking the active chip clears it. */
  function renderChips(host, key, values, labelKey) {
    host.replaceChildren();
    for (const v of values) {
      const b = el('button', t(labelKey + v), 'pchip');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(state[key] === v));
      b.addEventListener('click', () => {
        state[key] = state[key] === v ? '' : v;
        state.page = 1;
        load();
      });
      host.appendChild(b);
    }
  }

  function renderCards(data) {
    listEl.replaceChildren();
    for (const p of data.puzzles) {
      const a = el('a', undefined, 'pz-card' + (p.solved ? ' is-solved' : ''));
      a.href = '/puzzle/' + encodeURIComponent(p.id);
      const head = el('div', undefined, 'pz-card__head');
      head.append(el('b', p.title), p.solved ? el('span', '✓ ' + t('puzzles.solved'), 'pbadge') : el('span', undefined));
      const meta = el('div', undefined, 'pz-card__meta');
      meta.append(el('span', t('puzzles.level_' + p.level), 'pbadge pz-lv pz-lv--' + p.level),
        el('span', t('puzzles.rule_' + p.rule) + ' · ' + p.boardSize + '×' + p.boardSize, 'muted small'));
      const tags = el('div', undefined, 'pz-card__tags');
      for (const tg of p.tags || []) tags.appendChild(el('span', t('puzzles.tag_' + tg), 'pbadge'));
      a.append(head, meta, tags);
      if (p.author) a.appendChild(el('small', t('puzzles.by', { name: p.author.displayName }), 'muted'));
      listEl.appendChild(a);
    }
    emptyEl.hidden = data.puzzles.length > 0;
    emptyEl.textContent = t('puzzles.empty');
    totalEl.textContent = t('puzzles.total', { n: data.pagination.total });
  }

  function renderPager(pg) {
    pagerEl.replaceChildren();
    if (pg.totalPages <= 1) return;
    const prev = el('button', t('rankings.prev'), 'pbtn');
    const next = el('button', t('rankings.next'), 'pbtn');
    prev.type = next.type = 'button';
    prev.disabled = pg.page <= 1;
    next.disabled = pg.page >= pg.totalPages;
    prev.addEventListener('click', () => { state.page = pg.page - 1; load(); });
    next.addEventListener('click', () => { state.page = pg.page + 1; load(); });
    pagerEl.append(prev, el('span', pg.page + ' / ' + pg.totalPages), next);
  }

  function query() {
    const q = new URLSearchParams();
    for (const k of ['level', 'rule', 'tag']) if (state[k]) q.set(k, state[k]);
    if (state.page > 1) q.set('page', String(state.page));
    return q.toString();
  }

  async function load() {
    renderChips(levelsEl, 'level', LEVELS, 'puzzles.level_');
    renderChips(rulesEl, 'rule', RULES, 'puzzles.rule_');
    renderChips(tagsEl, 'tag', TAGS, 'puzzles.tag_');
    history.replaceState(null, '', '?' + query());
    try {
      const res = await fetch('/api/puzzles?' + query(), { credentials: 'same-origin' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      renderCards(data);
      renderPager(data.pagination);
    } catch (err) {
      listEl.replaceChildren();
      emptyEl.hidden = false;
      emptyEl.textContent = t('puzzles.error');
    }
  }

  function init() {
    window.PlatformShell.build('learn');
    load();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
