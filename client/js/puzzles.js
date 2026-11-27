/**
 * puzzles.js — puzzle list as a training path (#203 7a-2, #508 concept C).
 *
 * No level picked → one shelf per level (GET /api/puzzles?level=<l>&rule=&tag=, first page each) with the
 * viewer's progress from GET /api/puzzles/progress; a hero "continue" link goes to the first unsolved puzzle.
 * A level picked ("See all" or the level filter) → that level as a paged grid. Filters live in the query
 * string. All server text goes through textContent; one fact per chip (never "A · B").
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const LEVELS = ['easy', 'medium', 'hard', 'expert'];
  const RULES = ['freestyle', 'standard', 'caro', 'renju'];
  const TAGS = ['attack', 'defense', 'trap', 'vct', 'vcf'];
  const $ = (id) => document.getElementById(id);

  const levelsEl = $('pz-levels');
  const rulesEl = $('pz-rules');
  const tagsEl = $('pz-tags');
  const listEl = $('pz-list');
  const shelvesEl = $('pz-shelves');
  const levelHeadEl = $('pz-level-head');
  const emptyEl = $('pz-empty');
  const totalEl = $('pz-total');
  const pagerEl = $('pz-pager');
  const continueEl = $('pz-continue');

  const params = new URLSearchParams(location.search);
  const pick = (name, allowed) => (allowed.includes(params.get(name)) ? params.get(name) : '');
  const state = {
    level: pick('level', LEVELS),
    rule: pick('rule', RULES),
    tag: pick('tag', TAGS),
    page: Math.max(1, parseInt(params.get('page'), 10) || 1),
  };
  let seq = 0; // a newer load() wins over a slower older one

  function withIcon(node, name) { if (window.PlatformShell && window.PlatformShell.icon) node.prepend(window.PlatformShell.icon(name)); return node; }

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  /** A row of toggle options for one filter; clicking the active option clears it. */
  function renderChips(host, key, values, labelKey) {
    host.replaceChildren();
    for (const v of values) {
      const b = el('button', t(labelKey + v), 'mseg__opt');
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

  /** Side-to-move chip: stone dot + "Black to move". */
  function sideTag(side) {
    const n = el('span', undefined, 'pz-tag');
    const dot = el('span', undefined, 'pz-dot pz-dot--' + side);
    dot.setAttribute('aria-hidden', 'true');
    n.append(dot, document.createTextNode(t(side === 'WHITE' ? 'puzzles.side_white_short' : 'puzzles.side_black_short')));
    return n;
  }

  /** One puzzle card: number + solved, title, prompt, then one chip per fact. */
  function card(p) {
    const a = el('a', undefined, 'pz-card pz-panel' + (p.solved ? ' is-solved' : ''));
    a.href = '/puzzle/' + encodeURIComponent(p.id);
    const head = el('div', undefined, 'pz-card__head');
    head.append(el('span', p.number ? '#' + p.number : '', 'pz-num'),
      p.solved ? withIcon(el('span', t('puzzles.solved'), 'pz-tag pz-tag--ok'), 'ph-regular-check-circle') : el('span'));
    a.append(head, el('b', p.title, 'pz-card__title'));
    if (p.prompt) a.appendChild(el('p', p.prompt, 'pz-card__prompt'));
    const meta = el('div', undefined, 'pz-card__meta');
    meta.append(el('span', t('puzzles.level_' + p.level), 'pz-tag pz-tag--lv-' + p.level), el('span', t('puzzles.rule_' + p.rule), 'pz-tag'),
      el('span', p.boardSize + '×' + p.boardSize, 'pz-tag'));
    if (p.toMove) meta.appendChild(sideTag(p.toMove));
    for (const tg of p.tags || []) meta.appendChild(el('span', t('puzzles.tag_' + tg), 'pz-tag'));
    a.appendChild(meta);
    if (p.author) a.appendChild(el('small', t('puzzles.by', { name: p.author.displayName }), 'pz-card__by'));
    return a;
  }

  /** Level heading + progress ("18 / 24 solved" and a bar for members, "24 puzzles" for guests). */
  function levelHead(level, prog, total, withAll) {
    const frag = document.createDocumentFragment();
    const head = el('div', undefined, 'pz-shelf__head');
    const titles = el('div');
    const h = el('h2', t('puzzles.level_' + level), 'pz-h2');
    h.id = 'pz-sh-' + level;
    const solved = prog && typeof prog.solved === 'number' ? prog.solved : null;
    const count = prog && typeof prog.total === 'number' ? prog.total : total;
    titles.append(h, el('p', solved === null ? t('puzzles.total', { n: count }) : t('puzzles.shelf_progress', { n: solved, m: count }), 'pz-help'));
    head.appendChild(titles);
    if (withAll) {
      const all = el('button', t('puzzles.shelf_all'), 'mtbtn mtbtn--quiet mtbtn--sm');
      all.type = 'button';
      all.addEventListener('click', () => { state.level = level; state.page = 1; load(); window.scrollTo && window.scrollTo(0, 0); });
      head.appendChild(all);
    }
    frag.appendChild(head);
    if (solved !== null && count > 0) {
      const bar = el('div', undefined, 'pz-progress');
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-label', t('puzzles.shelf_progress_aria', { level: t('puzzles.level_' + level) }));
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', String(count));
      bar.setAttribute('aria-valuenow', String(solved));
      const fill = el('i');
      fill.style.width = Math.round((solved / count) * 100) + '%';
      bar.appendChild(fill);
      frag.appendChild(bar);
    }
    return frag;
  }

  /** Hero: solved summary and the "continue" link to the first unsolved puzzle, easiest level first. */
  function renderHero(prog, cardsById) {
    const total = prog && typeof prog.total === 'number' ? prog.total : null;
    if (total === null) totalEl.textContent = '';
    else totalEl.textContent = typeof prog.solved === 'number' ? t('puzzles.path_solved', { n: prog.solved, m: total }) : t('puzzles.total', { n: total });
    const lv = prog && prog.levels && LEVELS.map((l) => prog.levels[l]).find((x) => x && x.nextId);
    continueEl.hidden = !lv;
    if (!lv) return;
    continueEl.href = '/puzzle/' + encodeURIComponent(lv.nextId);
    const p = cardsById.get(lv.nextId);
    continueEl.textContent = p ? t('puzzles.continue', { title: p.title }) : t('puzzles.continue_plain');
  }

  function renderPager(pg) {
    pagerEl.replaceChildren();
    if (!pg || pg.totalPages <= 1) return;
    const prev = el('button', t('rankings.prev'), 'mtbtn mtbtn--quiet');
    const next = el('button', t('rankings.next'), 'mtbtn mtbtn--quiet');
    prev.type = next.type = 'button';
    prev.disabled = pg.page <= 1;
    next.disabled = pg.page >= pg.totalPages;
    prev.addEventListener('click', () => { state.page = pg.page - 1; load(true); });
    next.addEventListener('click', () => { state.page = pg.page + 1; load(true); });
    pagerEl.append(prev, el('span', pg.page + ' / ' + pg.totalPages), next);
  }

  function query(over) {
    const q = new URLSearchParams();
    const s = { ...state, ...over };
    for (const k of ['level', 'rule', 'tag']) if (s[k]) q.set(k, s[k]);
    if (s.page > 1) q.set('page', String(s.page));
    return q.toString();
  }

  async function getJson(url) {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  /** Progress is decoration: a failure leaves the shelves without bars, never breaks the list. */
  const getProgress = () => getJson('/api/puzzles/progress?' + query({ level: '', page: 1 })).catch(() => null);

  function showEmpty(text) {
    emptyEl.hidden = !text;
    emptyEl.textContent = text || '';
  }

  /** One level, paged grid. */
  async function loadLevel(my, toTop) {
    const [prog, data] = await Promise.all([getProgress(), getJson('/api/puzzles?' + query())]);
    if (my !== seq) return;
    shelvesEl.replaceChildren();
    levelHeadEl.hidden = false;
    levelHeadEl.replaceChildren(levelHead(state.level, prog && prog.levels && prog.levels[state.level], data.pagination.total, false));
    listEl.replaceChildren(...data.puzzles.map(card));
    renderHero(prog, new Map(data.puzzles.map((p) => [p.id, p])));
    showEmpty(data.puzzles.length ? '' : t('puzzles.empty'));
    renderPager(data.pagination);
    if (toTop && listEl.scrollIntoView) listEl.scrollIntoView({ block: 'start' });
  }

  /** Every level as a shelf of its first page; levels with nothing to show are left out. */
  async function loadShelves(my) {
    const [prog, ...lists] = await Promise.all([getProgress(), ...LEVELS.map((l) => getJson('/api/puzzles?' + query({ level: l, page: 1 })))]);
    if (my !== seq) return;
    levelHeadEl.hidden = true;
    levelHeadEl.replaceChildren();
    listEl.replaceChildren();
    renderPager(null);
    const byId = new Map();
    const shelves = [];
    LEVELS.forEach((level, i) => {
      const data = lists[i];
      if (!data || !data.puzzles || !data.puzzles.length) return;
      data.puzzles.forEach((p) => byId.set(p.id, p));
      const sec = el('section', undefined, 'pz-shelf');
      sec.setAttribute('aria-labelledby', 'pz-sh-' + level);
      const strip = el('div', undefined, 'pz-strip');
      strip.append(...data.puzzles.map(card));
      sec.append(levelHead(level, prog && prog.levels && prog.levels[level], data.pagination.total, true), strip);
      shelves.push(sec);
    });
    shelvesEl.replaceChildren(...shelves);
    renderHero(prog, byId);
    showEmpty(shelves.length ? '' : t('puzzles.empty'));
  }

  /** @param {boolean} [toTop] a pager click: bring the first card of the new page into view (#277). */
  async function load(toTop) {
    const my = ++seq;
    renderChips(levelsEl, 'level', LEVELS, 'puzzles.level_');
    renderChips(rulesEl, 'rule', RULES, 'puzzles.rule_');
    renderChips(tagsEl, 'tag', TAGS, 'puzzles.tag_');
    history.replaceState(null, '', location.pathname + (query() ? '?' + query() : '')); // <base href="/"> would resolve a bare '?x' to "/?x" (#274)
    try {
      if (state.level) await loadLevel(my, toTop);
      else await loadShelves(my);
    } catch (err) {
      if (my !== seq) return;
      listEl.replaceChildren();
      shelvesEl.replaceChildren();
      showEmpty(t('puzzles.error'));
    }
  }

  function init() {
    window.PlatformShell.build('learn');
    const u = window.GvnSession && window.GvnSession.getUser && window.GvnSession.getUser();
    if (window.GvnSession && (!u || u.isGuest)) $('pz-actions').hidden = true; // member-only actions (#275)
    load();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
