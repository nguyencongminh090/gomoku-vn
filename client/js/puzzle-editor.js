/**
 * puzzle-editor.js — author a puzzle (#203 7a-3), pages /puzzles/new and /puzzles/new?id=<id> (edit).
 *
 * Tools place black / white / auto-alternating stones, walls, portals (two clicks = a pair) or erase, or "answer" (a click appends a cell to the
 * active answer line). Answers are the solver's moves only (several accepted lines); each line
 * is a text field parsed by Coords.parseList (`H8` or sequence numbers). Submit → POST/PUT
 * /api/puzzles; all validation is the server's, the client only maps error codes to messages.
 * Member-only: guests see a login hint. BoardRenderer via setState/onCellClick only.
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const RULES = ['freestyle', 'standard', 'caro'];
  const LEVELS = ['easy', 'medium', 'hard', 'expert'];
  const TAGS = ['attack', 'defense', 'trap', 'vct', 'vcf'];
  const SIZES = [15, 17, 19, 20];
  const MODES = ['sequence', 'final_move'];
  const MAX_TAGS = 3;
  const MAX_PORTALS = 8;

  const st = { size: 15, stones: new Map(), tool: 'BLACK', walls: new Map(), portals: [], pendingPortal: null, tags: new Set(), answers: [''], active: 0, editId: null };
  let renderer = null;

  function withIcon(node, name) { if (window.PlatformShell && window.PlatformShell.icon) node.prepend(window.PlatformShell.icon(name)); return node; }

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }

  function fillSelect(sel, values, labelKey, current) {
    sel.replaceChildren();
    for (const v of values) {
      const o = el('option', labelKey ? t(labelKey + v) : String(v));
      o.value = String(v);
      sel.appendChild(o);
    }
    if (current !== undefined) sel.value = String(current);
  }

  const stoneList = () => [...st.stones.entries()].map(([k, color]) => {
    const [x, y] = k.split(',').map(Number);
    return { x, y, color };
  });
  const portalCells = () => st.portals.flatMap((p) => [p.a, p.b]);
  const wallList = () => [...st.walls.values()];

  /** Remove whatever sits on a cell (stone, wall, or both ends of a portal). */
  function clearCell(x, y) {
    const k = cellKey(x, y);
    st.stones.delete(k);
    st.walls.delete(k);
    st.portals = st.portals.filter((p) => cellKey(p.a.x, p.a.y) !== k && cellKey(p.b.x, p.b.y) !== k);
    if (st.pendingPortal && cellKey(st.pendingPortal.x, st.pendingPortal.y) === k) st.pendingPortal = null;
  }

  /** Black/white to move implied by the stone counts, or null when they do not fit a puzzle. */
  function impliedToMove() {
    const b = stoneList().filter((s) => s.color === 'BLACK').length;
    const w = stoneList().length - b;
    return b === w ? 'BLACK' : b === w + 1 ? 'WHITE' : null;
  }

  /** Next colour of the auto tool: black first, then alternating (counts decide, so erasing keeps it in step). */
  function autoColor() {
    const b = stoneList().filter((s) => s.color === 'BLACK').length;
    return b > stoneList().length - b ? 'WHITE' : 'BLACK';
  }

  const toMove = () => $('ed-tomove').value;
  const cellKey = (x, y) => x + ',' + y;

  /** Cells of the active answer line, or [] when the text does not parse yet. */
  function activeCells() {
    return window.Coords.parseList(st.answers[st.active] || '', st.size) || [];
  }

  function draw() {
    const answerTool = st.tool === 'ANSWER';
    renderer.setState(window.PuzzleBoard.state(st.size, stoneList(), toMove(), answerTool ? activeCells() : [], {
      interactive: true,
      walls: wallList(),
      portals: st.portals,
      myColor: st.tool === 'WHITE' ? 'WHITE' : st.tool === 'BLACK' ? 'BLACK' : st.tool === 'AUTO' ? autoColor() : toMove(),
    }));
    const b = stoneList().filter((s) => s.color === 'BLACK').length;
    const w = stoneList().length - b;
    $('ed-count').textContent = t('puzzles.counts', { b, w, need: toMove() === 'BLACK' ? t('puzzles.counts_equal') : t('puzzles.counts_black_more') });
  }

  function onCell(x, y) {
    if (st.tool === 'ANSWER') {
      if (st.stones.has(cellKey(x, y)) || st.walls.has(cellKey(x, y)) || portalCells().some((c) => c.x === x && c.y === y)) return;
      const label = window.Coords.label(x, y, st.size);
      const cur = (st.answers[st.active] || '').trim();
      st.answers[st.active] = $('ed-mode').value === 'final_move' ? label : (cur ? cur + ', ' : '') + label;
      renderAnswers();
    } else if (st.tool === 'ERASE') {
      clearCell(x, y);
    } else if (st.tool === 'WALL') {
      const had = st.walls.has(cellKey(x, y));
      clearCell(x, y);
      if (!had) st.walls.set(cellKey(x, y), { x, y }); // clicking a wall again removes it
    } else if (st.tool === 'PORTAL') {
      const first = st.pendingPortal;
      if (first && (first.x !== x || first.y !== y)) {
        clearCell(x, y);
        if (st.portals.length < MAX_PORTALS) st.portals.push({ a: first, b: { x, y } });
        st.pendingPortal = null;
      } else if (first) {
        st.pendingPortal = null; // same cell again cancels
      } else {
        clearCell(x, y);
        st.pendingPortal = { x, y };
      }
    } else {
      const color = st.tool === 'AUTO' ? autoColor() : st.tool;
      clearCell(x, y);
      st.stones.set(cellKey(x, y), color);
      if (st.tool === 'AUTO' && impliedToMove()) $('ed-tomove').value = impliedToMove();
    }
    draw();
  }

  function renderTools() {
    const host = $('ed-tools');
    host.replaceChildren();
    // Stones as stones, eraser, target = mark the answer move (#214).
    for (const [id, key, ic] of [['BLACK', 'puzzles.tool_black', 'ph-fill-circle'], ['WHITE', 'puzzles.tool_white', 'ph-fill-circle'], ['AUTO', 'puzzles.tool_auto', 'ph-regular-shuffle'], ['WALL', 'puzzles.tool_wall', 'ph-regular-circle-half'], ['PORTAL', 'puzzles.tool_portal', 'ph-regular-door-open'], ['ERASE', 'puzzles.tool_erase', 'ph-regular-eraser'], ['ANSWER', 'puzzles.tool_answer', 'ph-regular-target']]) {
      const b = withIcon(el('button', t(key), 'pchip'), ic);
      // Stone icons keep the stone colour in every chip state (a currentColor disc read as white on the active chip).
      if (id === 'BLACK' || id === 'WHITE') { const svg = b.querySelector('svg'); if (svg) svg.classList.add('pz-stone', 'pz-stone--' + id.toLowerCase()); }
      b.type = 'button';
      b.setAttribute('aria-pressed', String(st.tool === id));
      b.addEventListener('click', () => { st.tool = id; st.pendingPortal = null; renderTools(); draw(); });
      host.appendChild(b);
    }
  }

  function renderTags() {
    const host = $('ed-tags');
    host.replaceChildren();
    for (const tg of TAGS) {
      const b = el('button', t('puzzles.tag_' + tg), 'pchip');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(st.tags.has(tg)));
      b.addEventListener('click', () => {
        if (st.tags.has(tg)) st.tags.delete(tg);
        else if (st.tags.size < MAX_TAGS) st.tags.add(tg);
        renderTags();
      });
      host.appendChild(b);
    }
  }

  function renderAnswers() {
    const host = $('ed-answers');
    host.replaceChildren();
    $('ed-answers-help').textContent = t($('ed-mode').value === 'final_move' ? 'puzzles.answers_help_final' : 'puzzles.answers_help_seq');
    st.answers.forEach((text, i) => {
      const row = el('div', undefined, 'pform__row');
      const input = el('input');
      input.type = 'text';
      input.maxLength = 400;
      input.value = text;
      input.placeholder = 'H8, J9';
      input.setAttribute('aria-label', t('puzzles.answer_n', { n: i + 1 }));
      input.className = 'pz-answer' + (i === st.active ? ' is-active' : '');
      input.addEventListener('focus', () => {
        st.active = i;
        host.querySelectorAll('.pz-answer').forEach((n, k) => n.classList.toggle('is-active', k === i)); // no re-render: it would drop the caret
        draw();
      });
      input.addEventListener('input', () => { st.answers[i] = input.value; draw(); });
      row.appendChild(input);
      if (st.answers.length > 1) {
        const del = withIcon(el('button', undefined, 'pbtn pbtn--ghost pbtn--sm'), 'ph-regular-trash');
        del.type = 'button';
        del.setAttribute('aria-label', t('puzzles.remove_answer'));
        del.addEventListener('click', () => { st.answers.splice(i, 1); st.active = Math.min(st.active, st.answers.length - 1); renderAnswers(); draw(); });
        row.appendChild(del);
      }
      host.appendChild(row);
    });
  }

  /** Paste-in setup: replaces stones, walls and portals with what the text's coordinates describe. */
  function importText() {
    const out = window.Coords.parseSetup($('ed-import').value, st.size);
    if (out.bad.length) { say(t('puzzles.import_bad', { cells: out.bad.slice(0, 6).join(', '), size: st.size })); return; }
    if (!out.stones.length && !out.walls.length && !out.portals.length) { say(t('puzzles.import_none')); return; }
    say('');
    st.stones = new Map(out.stones.map((c) => [cellKey(c.x, c.y), c.color]));
    st.walls = new Map(out.walls.map((c) => [cellKey(c.x, c.y), c]));
    st.portals = out.portals;
    st.pendingPortal = null;
    if (impliedToMove()) $('ed-tomove').value = impliedToMove();
    draw();
    say(t('puzzles.import_ok', { n: out.stones.length + out.walls.length + out.portals.length * 2 }), true);
  }

  function say(msg, good) {
    const r = $('ed-result');
    r.hidden = !msg;
    r.className = 'pz-result ' + (good ? 'is-right' : 'is-wrong');
    r.textContent = msg || '';
  }

  /** Turn the form into the API body, or null (and a message) when an answer line does not parse. */
  function buildBody() {
    const answers = [];
    for (const line of st.answers) {
      if (!line.trim()) continue;
      const cells = window.Coords.parseList(line, st.size);
      if (!cells) { say(t('err.puzzle_moves_invalid')); return null; }
      answers.push(cells);
    }
    return {
      title: $('ed-title').value, prompt: $('ed-prompt').value, rule: $('ed-rule').value, boardSize: st.size,
      toMove: toMove(), mode: $('ed-mode').value, level: $('ed-level').value, tags: [...st.tags],
      stones: stoneList(), layout: { walls: wallList(), portals: st.portals }, answers,
    };
  }

  async function submit(ev) {
    ev.preventDefault();
    say('');
    const body = buildBody();
    if (!body) return;
    $('ed-submit').disabled = true;
    try {
      const res = await fetch(st.editId ? '/api/puzzles/' + encodeURIComponent(st.editId) : '/api/puzzles', {
        method: st.editId ? 'PUT' : 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        say(t('puzzles.submitted'), true);
        setTimeout(() => { location.href = '/puzzles/mine'; }, 900);
        return;
      }
      say(data.code ? t('err.' + data.code.toLowerCase()) : t('puzzles.error'));
    } catch (err) {
      say(t('puzzles.error'));
    }
    $('ed-submit').disabled = false;
  }

  /** Changing the size drops stones that would fall off the smaller board. */
  function onSize() {
    st.size = parseInt($('ed-size').value, 10);
    for (const k of [...st.stones.keys()]) {
      const [x, y] = k.split(',').map(Number);
      if (x >= st.size || y >= st.size) st.stones.delete(k);
    }
    const inside = (c) => c.x < st.size && c.y < st.size;
    for (const [k, c] of [...st.walls]) if (!inside(c)) st.walls.delete(k);
    st.portals = st.portals.filter((p) => inside(p.a) && inside(p.b));
    st.pendingPortal = null;
    renderer.boardSize = st.size;
    renderer.resize();
    draw();
  }

  function load(p) {
    st.editId = p.id;
    $('ed-h1').textContent = t('puzzles.edit_h1');
    $('ed-edit-note').hidden = p.status === 'pending';
    $('ed-title').value = p.title;
    $('ed-prompt').value = p.prompt || '';
    $('ed-rule').value = p.rule;
    $('ed-size').value = String(p.boardSize);
    st.size = p.boardSize;
    $('ed-tomove').value = p.toMove;
    $('ed-level').value = p.level;
    $('ed-mode').value = p.mode;
    st.tags = new Set(p.tags);
    st.stones = new Map(p.stones.map((s) => [cellKey(s.x, s.y), s.color]));
    st.walls = new Map((p.walls || []).map((c) => [cellKey(c.x, c.y), { x: c.x, y: c.y }]));
    st.portals = (p.portals || []).map((q) => ({ a: q.a, b: q.b }));
    st.answers = (p.answers || []).map((a) => a.map((c) => window.Coords.label(c.x, c.y, p.boardSize)).join(', '));
    if (!st.answers.length) st.answers = [''];
    st.active = 0;
  }

  async function init() {
    window.PlatformShell.build('learn');
    const fail = (msg) => { $('ed-error').hidden = false; $('ed-error').textContent = msg; };
    const u = window.GvnSession && window.GvnSession.getUser && window.GvnSession.getUser();
    // No cached member session → say so without the doomed 401 probe (#275).
    if (window.GvnSession && (!u || u.isGuest)) return fail(t('puzzles.login_to_submit'));
    try {
      const me = await (window.PlatformShell && window.PlatformShell.fetchMe ? window.PlatformShell.fetchMe() : fetch('/api/rankings/me', { credentials: 'same-origin' }));
      const m = me.ok ? await me.json().catch(() => ({})) : null;
      // /api/rankings/me answers 200 for guests too (their `guest_…` id) — the puzzle API is member-only (#273).
      if (!m || !m.userId || String(m.userId).startsWith('guest_') || (u && u.isGuest)) return fail(t('puzzles.login_to_submit'));
    } catch (_) { return fail(t('puzzles.error')); }

    fillSelect($('ed-rule'), RULES, 'puzzles.rule_');
    fillSelect($('ed-size'), SIZES, null, 15);
    fillSelect($('ed-tomove'), ['BLACK', 'WHITE'], 'puzzles.side_');
    fillSelect($('ed-level'), LEVELS, 'puzzles.level_', 'medium');
    fillSelect($('ed-mode'), MODES, 'puzzles.mode_');

    const editId = new URLSearchParams(location.search).get('id');
    if (editId) {
      try {
        const res = await fetch('/api/puzzles/' + encodeURIComponent(editId), { credentials: 'same-origin' });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return fail(data.code ? t('err.' + data.code.toLowerCase()) : t('puzzles.error'));
        load(data.puzzle);
      } catch (_) { return fail(t('puzzles.error')); }
    }

    $('ed-view').hidden = false;
    renderer = new window.BoardRenderer($('ed-canvas'), { boardSize: st.size, clickMode: 'single', clickOccupied: true, onCellClick: onCell });
    renderTools(); renderTags(); renderAnswers();
    $('ed-size').addEventListener('change', onSize);
    $('ed-tomove').addEventListener('change', draw);
    $('ed-mode').addEventListener('change', () => { renderAnswers(); draw(); });
    $('ed-add-answer').addEventListener('click', () => { st.answers.push(''); st.active = st.answers.length - 1; renderAnswers(); draw(); });
    $('ed-import-btn').addEventListener('click', importText);
    $('ed-form').addEventListener('submit', submit);
    requestAnimationFrame(() => { renderer.resize(); draw(); });
    window.addEventListener('resize', () => { renderer.resize(); draw(); });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
