/**
 * puzzle-editor.js — author a puzzle (#203 7a-3), pages /puzzles/new and /puzzles/new?id=<id> (edit).
 *
 * Tools place black / white / eraser on the board, or "answer" (a click appends a cell to the
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
  const TAGS = ['three', 'four_three', 'vcf', 'vct', 'defense', 'trap'];
  const SIZES = [15, 17, 19, 20];
  const MODES = ['sequence', 'final_move'];
  const MAX_TAGS = 3;

  const st = { size: 15, stones: new Map(), tool: 'BLACK', tags: new Set(), answers: [''], active: 0, editId: null };
  let renderer = null;

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
      myColor: st.tool === 'WHITE' ? 'WHITE' : st.tool === 'BLACK' ? 'BLACK' : toMove(),
    }));
    const b = stoneList().filter((s) => s.color === 'BLACK').length;
    const w = stoneList().length - b;
    $('ed-count').textContent = t('puzzles.counts', { b, w, need: toMove() === 'BLACK' ? t('puzzles.counts_equal') : t('puzzles.counts_black_more') });
  }

  function onCell(x, y) {
    if (st.tool === 'ANSWER') {
      if (st.stones.has(cellKey(x, y))) return;
      const label = window.Coords.label(x, y, st.size);
      const cur = (st.answers[st.active] || '').trim();
      st.answers[st.active] = $('ed-mode').value === 'final_move' ? label : (cur ? cur + ', ' : '') + label;
      renderAnswers();
    } else if (st.tool === 'ERASE') {
      st.stones.delete(cellKey(x, y));
    } else {
      st.stones.set(cellKey(x, y), st.tool);
    }
    draw();
  }

  function renderTools() {
    const host = $('ed-tools');
    host.replaceChildren();
    for (const [id, key] of [['BLACK', 'puzzles.tool_black'], ['WHITE', 'puzzles.tool_white'], ['ERASE', 'puzzles.tool_erase'], ['ANSWER', 'puzzles.tool_answer']]) {
      const b = el('button', t(key), 'pchip');
      b.type = 'button';
      b.setAttribute('aria-pressed', String(st.tool === id));
      b.addEventListener('click', () => { st.tool = id; renderTools(); draw(); });
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
        const del = el('button', '✕', 'pbtn pbtn--ghost pbtn--sm');
        del.type = 'button';
        del.setAttribute('aria-label', t('puzzles.remove_answer'));
        del.addEventListener('click', () => { st.answers.splice(i, 1); st.active = Math.min(st.active, st.answers.length - 1); renderAnswers(); draw(); });
        row.appendChild(del);
      }
      host.appendChild(row);
    });
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
      stones: stoneList(), answers,
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
    st.answers = (p.answers || []).map((a) => a.map((c) => window.Coords.label(c.x, c.y, p.boardSize)).join(', '));
    if (!st.answers.length) st.answers = [''];
    st.active = 0;
  }

  async function init() {
    window.PlatformShell.build('learn');
    const fail = (msg) => { $('ed-error').hidden = false; $('ed-error').textContent = msg; };
    try {
      const me = await fetch('/api/rankings/me', { credentials: 'same-origin' });
      if (!me.ok) return fail(t('puzzles.login_to_submit'));
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
    renderer = new window.BoardRenderer($('ed-canvas'), { boardSize: st.size, clickMode: 'single', onCellClick: onCell });
    renderTools(); renderTags(); renderAnswers();
    $('ed-size').addEventListener('change', onSize);
    $('ed-tomove').addEventListener('change', draw);
    $('ed-mode').addEventListener('change', () => { renderAnswers(); draw(); });
    $('ed-add-answer').addEventListener('click', () => { st.answers.push(''); st.active = st.answers.length - 1; renderAnswers(); draw(); });
    $('ed-form').addEventListener('submit', submit);
    requestAnimationFrame(() => { renderer.resize(); draw(); });
    window.addEventListener('resize', () => { renderer.resize(); draw(); });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
