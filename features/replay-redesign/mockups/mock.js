// Shared mockup logic for the replay redesign (A/B/C differ in markup + CSS only).
// Uses the REAL BoardRenderer (client/js/board.js) and MoveTree; data from fixture.js.
// Prototype of the pieces the implementation will move into client/js/: winLine, move times, deep link.
'use strict';
(function () {
  const G = window.DEMO_GAME;
  const V = document.body.dataset.variant;           // 'a' | 'b' | 'c'
  const $ = (s) => document.querySelector(s);
  const icon = (id) => `<svg class="icon" aria-hidden="true"><use href="${['pause','skip-back','skip-forward','link','git-branch','share-network','clock'].includes(id) ? '' : '/assets/icons/phosphor-sprite.svg'}#ph-regular-${id}"></use></svg>`;

  // ── Win line (prototype) ────────────────────────────────────────────────
  // Draw only for a five-in-a-row finish ('win', legacy 'normal'), only at the main-line end, and only if
  // the last stone is the winner's. winningRule is not stored, so every direction with a run >= 5 through the
  // last stone is drawn (union); an overline is drawn whole. Mirrors GameEngine._getLineInDirection (portals).
  const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];
  function runFrom(board, size, pmap, x, y, dx, dy, c) {
    const out = []; const seen = new Set([x + ',' + y]); let cx = x + dx, cy = y + dy;
    while (cx >= 0 && cy >= 0 && cx < size && cy < size) {
      const k = cx + ',' + cy; if (seen.has(k)) break; seen.add(k);
      const v = board[cy][cx];
      if (v === c) { out.push({ x: cx, y: cy }); cx += dx; cy += dy; }
      else if (v === -2) { const p = pmap.get(k); if (!p || seen.has(p.x + ',' + p.y)) break; seen.add(p.x + ',' + p.y); cx = p.x + dx; cy = p.y + dy; }
      else break;
    }
    return out;
  }
  function computeWinLine(game, board, last) {
    if (!last || !['win', 'normal'].includes(game.reason) || game.winner !== last.color) return null;
    const pmap = new Map();
    for (const p of game.portals || []) { pmap.set(p.a.x + ',' + p.a.y, p.b); pmap.set(p.b.x + ',' + p.b.y, p.a); }
    const c = last.color === 'BLACK' ? 1 : 2; const cells = new Map();
    for (const [dx, dy] of DIRS) {
      const line = [{ x: last.x, y: last.y }, ...runFrom(board, game.board_size, pmap, last.x, last.y, dx, dy, c), ...runFrom(board, game.board_size, pmap, last.x, last.y, -dx, -dy, c)];
      const uniq = new Map(line.map((s) => [s.x + ',' + s.y, s]));
      if (uniq.size >= 5) uniq.forEach((s, k) => cells.set(k, s));
    }
    return cells.size ? [...cells.values()] : null;
  }

  // ── Times ────────────────────────────────────────────────────────────────
  const hasTimes = G.moves.length > 0 && G.moves.every((m) => Number.isFinite(m.timestamp));
  const fmt = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? s + 's' : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const think = (i) => (!hasTimes || i === 0 ? null : G.moves[i].timestamp - G.moves[i - 1].timestamp);
  const duration = Date.parse(G.ended_at) - Date.parse(G.started_at);

  // ── Tree + a demo variation (what a user adds in analysis mode) ─────────
  const tree = MoveTree.fromMoveHistory(G.moves, { boardSize: G.board_size, walls: G.walls, portals: G.portals });
  const main = []; for (let n = tree.root; n.children.length; ) { n = n.children[0]; main.push(n); }
  tree.goToNode(main[28]); tree.addMove(10, 6, 'WHITE'); tree.addMove(11, 7, 'BLACK'); tree.addMove(9, 5, 'WHITE');
  const start = Number(new URLSearchParams(location.search).get('move'));
  tree.goToNode(start > 0 && start <= main.length ? main[start - 1] : main[main.length - 1]);

  const board = new BoardRenderer($('#rp-canvas'), { boardSize: G.board_size, onCellClick: (x, y) => { if (tree.isCellAvailable(x, y)) { tree.addMove(x, y, tree.getNextColor()); sync(); } } });

  // ── Info ─────────────────────────────────────────────────────────────────
  const winSeat = G.winner;
  $('#rp-black').innerHTML = `<span class="rp-stone rp-stone--x" aria-hidden="true">✕</span><span class="rp-name">${G.black_player_name}</span>${winSeat === 'BLACK' ? `<span class="rp-win">${icon('trophy')}Thắng</span>` : ''}`;
  $('#rp-white').innerHTML = `<span class="rp-stone rp-stone--o" aria-hidden="true">○</span><span class="rp-name">${G.white_player_name}</span>${winSeat === 'WHITE' ? `<span class="rp-win">${icon('trophy')}Thắng</span>` : ''}`;
  $('#rp-result').textContent = `${G.winner_name} thắng — 5 quân liên tiếp`;
  $('#rp-meta').innerHTML = [
    `<span class="rp-chip">${G.board_size}×${G.board_size}</span>`,
    `<span class="rp-chip">Tường + Cổng</span>`,
    `<span class="rp-chip">${G.moves.length} nước</span>`,
    hasTimes ? `<span class="rp-chip">${icon('clock')}${fmt(duration)}</span>` : '',
    `<span class="rp-chip">20/11/2026 20:09</span>`,
  ].join('');
  document.querySelectorAll('[data-m]').forEach((el) => { el.innerHTML = $('#rp-' + el.dataset.m).innerHTML; el.className = $('#rp-' + el.dataset.m).className; });

  // ── Move list renderers ─────────────────────────────────────────────────
  // Board letters (A… incl. I), as board.js draws them — MoveTree's skip-I labels are bug #499.
  const label = (n) => 'ABCDEFGHIJKLMNOPQRST'[n.move.x] + (G.board_size - n.move.y);
  const cur = () => tree.currentNode;
  function cell(n, i) {
    const t = think(i);
    return `<button type="button" class="rp-mv${n === cur() ? ' is-cur' : ''}" data-id="${n.id}"${n === cur() ? ' aria-current="step"' : ''}><span class="rp-mv__c">${label(n)}</span>${hasTimes && V !== 'c' ? `<span class="rp-mv__t">${t == null ? '—' : fmt(t)}</span>` : ''}</button>`;
  }
  function varLine(n) {            // a branch as inline moves "30… K7 31. L8 …"
    const out = []; let k = n;
    while (k) { out.push(`<button type="button" class="rp-vmv${k === cur() ? ' is-cur' : ''}" data-id="${k.id}"${k === cur() ? ' aria-current="step"' : ''}>${k.depth}${k.move.color === 'WHITE' && k === n ? '…' : '.'} ${label(k)}</button>`); k = k.children[0]; }
    return out.join('');
  }
  function renderTable() {         // A: numbered pairs, variations inline in a parenthesised row
    let h = '';
    for (let i = 0; i < main.length; i += 2) {
      h += `<div class="rp-row"><span class="rp-no">${i / 2 + 1}</span>${cell(main[i], i)}${main[i + 1] ? cell(main[i + 1], i + 1) : '<span></span>'}</div>`;
      for (const j of [i, i + 1]) { const n = main[j]; if (n && n.children.length > 1) for (const v of n.children.slice(1)) h += `<div class="rp-var" role="group" aria-label="Biến thể">(${varLine(v)})</div>`; }
    }
    return h;
  }
  function renderTree() {          // B: one move per row; a variation is an indented branch with a rail
    let h = '';
    main.forEach((n, i) => {
      h += `<div class="rp-line"><span class="rp-no">${i + 1}</span><span class="rp-dot rp-dot--${n.move.color.toLowerCase()}" aria-hidden="true"></span>${cell(n, i)}</div>`;
      if (n.children.length > 1) for (const v of n.children.slice(1)) h += `<div class="rp-branch">${icon('git-branch')}<div class="rp-branch__mv">${varLine(v)}</div></div>`;
    });
    return h;
  }
  function renderGrid() {          // C: dense pill grid, numbered; variations live in the Tree tab
    return main.map((n, i) => `<span class="rp-g"><span class="rp-no">${i + 1}</span>${cell(n, i)}</span>`).join('');
  }
  function renderStrip() {         // phone strip (A): horizontal, scrolls the current move into view
    return main.map((n, i) => `<button type="button" class="rp-chipmv${n === cur() ? ' is-cur' : ''}" data-id="${n.id}"><b>${i + 1}</b>${label(n)}</button>`).join('');
  }
  const byId = (id) => { const st = [tree.root]; while (st.length) { const n = st.pop(); if (String(n.id) === id) return n; st.push(...n.children); } return null; };
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-id]'); if (b) { stop(); tree.goToNode(byId(b.dataset.id)); sync(); } });

  // ── Playback ─────────────────────────────────────────────────────────────
  let timer = null, speed = 600;
  const slider = $('#rp-slider');
  slider.max = main.length;
  // Branch points on the timeline (main-line moves that have variations)
  const ticks = $('#rp-ticks'); if (ticks) ticks.innerHTML = main.map((n, i) => (n.children.length > 1 ? `<i style="left:${((i + 1) / main.length) * 100}%"></i>` : '')).join('');
  function stop() { if (timer) { clearInterval(timer); timer = null; } $('#rp-play').innerHTML = icon('play'); $('#rp-play').setAttribute('aria-label', 'Tự động phát'); }
  function play() { if (cur().isLeaf) tree.goToStart(); timer = setInterval(() => { if (!tree.goForward()) return stop(); sync(); }, speed); $('#rp-play').innerHTML = icon('pause'); $('#rp-play').setAttribute('aria-label', 'Tạm dừng'); }
  $('#rp-play').addEventListener('click', () => (timer ? stop() : play()));
  $('#rp-first').addEventListener('click', () => { stop(); tree.goToStart(); sync(); });
  $('#rp-prev').addEventListener('click', () => { stop(); tree.goBack(); sync(); });
  $('#rp-next').addEventListener('click', () => { stop(); tree.goForward(); sync(); });
  $('#rp-last').addEventListener('click', () => { stop(); tree.goToEnd(); sync(); });
  slider.addEventListener('input', () => { stop(); const v = Number(slider.value); tree.goToNode(v ? main[v - 1] : tree.root); sync(); });
  document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => {
    speed = Number(b.dataset.speed); document.querySelectorAll('[data-speed]').forEach((o) => { o.classList.toggle('is-active', o === b); o.setAttribute('aria-pressed', String(o === b)); });
    b.parentElement.style.setProperty('--i', [...b.parentElement.children].filter((x) => x.dataset.speed).indexOf(b));
    if (timer) { stop(); play(); }
  }));
  document.addEventListener('keydown', (e) => {
    if (/INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.target.type !== 'range') return;
    const k = { ArrowLeft: () => tree.goBack(), ArrowRight: () => tree.goForward(), Home: () => tree.goToStart(), End: () => tree.goToEnd() }[e.key];
    if (k) { e.preventDefault(); stop(); k(); sync(); } else if (e.key === ' ') { e.preventDefault(); timer ? stop() : play(); }
  });
  // Share: copy /replay/<id>?move=N (keeps ?source=tournament)
  document.querySelectorAll('.rp-share').forEach((b) => b.addEventListener('click', () => {
    const toast = $('#rp-toast'); toast.hidden = false; toast.textContent = `Đã sao chép liên kết tới nước ${tree.getPath().length}`; setTimeout(() => { toast.hidden = true; }, 1800);
  }));
  // Tabs (B phone sheet, C panel)
  document.querySelectorAll('[role="tab"]').forEach((t) => t.addEventListener('click', () => {
    const list = t.closest('[role="tablist"]');
    list.querySelectorAll('[role="tab"]').forEach((o) => { o.setAttribute('aria-selected', String(o === t)); document.getElementById(o.getAttribute('aria-controls')).hidden = o !== t; });
    document.body.classList.add('sheet-open'); requestAnimationFrame(() => { board.resize(); sync(); });
  }));
  const sheetToggle = $('#rp-sheet-toggle');
  if (sheetToggle) sheetToggle.addEventListener('click', () => { const open = document.body.classList.toggle('sheet-open'); sheetToggle.setAttribute('aria-expanded', String(open)); });

  // Scroll only the list box (scrollIntoView would also scroll the page on phones).
  function keepInView(box, el, horiz) {
    if (!el) return; while (box && box !== document.body && box.scrollHeight <= box.clientHeight && box.scrollWidth <= box.clientWidth) box = box.parentElement;
    if (!box || box === document.body) return; const b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (horiz) box.scrollLeft += r.left - b.left - (b.width - r.width) / 2;
    else if (r.top < b.top) box.scrollTop -= b.top - r.top + 8; else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 8;
  }
  document.querySelectorAll('.rp-switch').forEach((sw) => sw.addEventListener('click', () => sw.setAttribute('aria-checked', String(sw.getAttribute('aria-checked') !== 'true'))));
  let tv = null;
  function sync() {
    const { board: b, lastMove } = tree.getBoardState();
    const atEnd = cur() === main[main.length - 1];
    const winLine = atEnd ? computeWinLine(G, b, { ...lastMove, color: cur().move.color }) : null;
    board.setState({ boardSize: G.board_size, board: b, walls: G.walls, portals: G.portals, lastMove, winLine, firstMoveZones: [], showZones: false, interactive: true, isMyTurn: true, myColor: tree.getNextColor().toLowerCase() });
    const n = tree.getPath().length; const onMain = main.includes(cur()) || cur().isRoot;
    slider.value = onMain ? n : slider.value;
    slider.style.setProperty('--pct', (Number(slider.value) / main.length) * 100 + '%');
    slider.setAttribute('aria-valuetext', `Nước ${n} trên ${main.length}`);
    $('#rp-counter').innerHTML = `<b>${n}</b><span>/ ${main.length}</span>`;
    const ml = $('#rp-moves'); if (ml) { ml.innerHTML = V === 'a' ? renderTable() : V === 'b' ? renderTree() : renderGrid(); keepInView(ml, ml.querySelector('.is-cur'), false); }
    const st = $('#rp-strip'); if (st) { st.innerHTML = renderStrip(); keepInView(st, st.querySelector('.is-cur'), true); }
    const peek = $('#rp-peek'); if (peek) { const i = n - 1; const t = i >= 0 && onMain ? think(i) : null; peek.innerHTML = n ? `<b>${n}.</b> ${label(cur())}${t != null ? `<span class="muted">${fmt(t)}</span>` : ''}${onMain ? '' : '<span class="pbadge">Biến thể</span>'}` : 'Bàn trống'; }
    const tc = $('#rp-tree'); if (tc && !tc.hidden) { tv = tv || new TreeView(tc, { onNodeClick: (node) => { tree.goToNode(node); sync(); } }); tv.setTree(tree); }
    $('#rp-del').disabled = onMain;
  }
  $('#rp-del').addEventListener('click', () => { if (!cur().isRoot && !main.includes(cur())) { tree.deleteNode(cur()); sync(); } });
  window.addEventListener('resize', () => board.resize());
  if (window.PlatformShell) window.PlatformShell.build('learn');
  requestAnimationFrame(() => { board.resize(); sync(); });
  window.__mock = { tree, main, board, computeWinLine };
})();
