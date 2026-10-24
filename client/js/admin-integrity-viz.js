/**
 * admin-integrity-viz.js — charts for the "Toàn vẹn xếp hạng" tab (#249 follow-up): player network (Louvain
 * communities), games-vs-rating scatter, two distributions. Plain SVG from `viz` of /api/admin/rating-integrity.
 * Descriptive only; every mark has a <title> tooltip. Exposes window.IntegrityViz.render(container, viz).
 */

'use strict';

(function () {
  const SVGNS = 'http://www.w3.org/2000/svg';
  const SLOTS = 5; // communities 0..4 get a categorical hue (--viz-1..5); the rest fold into "other"
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);

  function svg(tag, attrs, text) {
    const n = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
    if (text !== undefined) n.textContent = text;
    return n;
  }
  const slot = (c) => (c < SLOTS ? 'viz-c' + c : 'viz-c-other');
  const tip = (node, text) => { node.appendChild(svg('title', {}, text)); return node; };

  function panel(title, hint) {
    const box = document.createElement('figure');
    box.className = 'ri-chart';
    const cap = document.createElement('figcaption');
    const h = document.createElement('b');
    h.textContent = title;
    const p = document.createElement('span');
    p.textContent = hint || '';
    cap.append(h, p);
    box.appendChild(cap);
    return box;
  }

  /** Communities on a big circle (largest first), members on a small circle inside their community. Deterministic. */
  function layout(nodes, w, h) {
    const groups = new Map();
    for (const n of nodes) { if (!groups.has(n.community)) groups.set(n.community, []); groups.get(n.community).push(n); }
    const ids = [...groups.keys()].sort((a, b) => a - b);
    const cx = w / 2, cy = h / 2;
    const R = ids.length > 1 ? Math.min(w, h) * 0.34 : 0;
    const pos = new Map();
    ids.forEach((c, gi) => {
      const members = groups.get(c);
      const ga = (2 * Math.PI * gi) / ids.length - Math.PI / 2;
      const gx = cx + R * Math.cos(ga), gy = cy + R * Math.sin(ga);
      const r = members.length === 1 ? 0 : Math.min(Math.min(w, h) * 0.17, 14 + members.length * 5);
      members.forEach((n, i) => {
        const a = (2 * Math.PI * i) / members.length;
        pos.set(n.id, { x: gx + r * Math.cos(a), y: gy + r * Math.sin(a) });
      });
    });
    return pos;
  }

  /** Force layout (repulsion + edge springs + pull to the community's anchor). Seeded from layout(), so it is deterministic. */
  function simulate(nodes, edges, anchors, W, H) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const links = edges.map((e) => ({ a: byId.get(e.a), b: byId.get(e.b), w: e.games })).filter((l) => l.a && l.b);
    const grow = Math.max(1, nodes.length / 40); // a bigger graph needs a stronger push and longer links to fill the canvas
    const repel = 2400 * grow * grow, rest = 56 * grow;
    function step(alpha) {
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          let dx = b.x - a.x, dy = b.y - a.y;
          const d2 = Math.max(dx * dx + dy * dy, 36);
          const f = (repel * alpha) / d2, d = Math.sqrt(d2);
          dx = (dx / d) * f; dy = (dy / d) * f;
          a.vx -= dx; a.vy -= dy; b.vx += dx; b.vy += dy;
          // collision: circles never overlap (6px gap inside a group, 16px between groups), regardless of alpha, so the layout settles overlap-free
          const min = a.r + b.r + (a.community === b.community ? 6 : 16), d1 = Math.sqrt(d2); // wider gap between groups
          if (d1 < min) {
            const push = (min - d1) / 2, ux = (b.x - a.x) / d1, uy = (b.y - a.y) / d1;
            if (!a.fixed) { a.x -= ux * push; a.y -= uy * push; }
            if (!b.fixed) { b.x += ux * push; b.y += uy * push; }
          }
        }
      }
      for (const l of links) {
        const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, d = Math.hypot(dx, dy) || 1;
        const f = ((d - rest) * 0.02 * alpha) * (1 + Math.min(2, l.w / 10)) * (l.a.community === l.b.community ? 1 : 0.25) / d; // cross-group links pull weakly so groups stay apart
        l.a.vx += dx * f; l.a.vy += dy * f; l.b.vx -= dx * f; l.b.vy -= dy * f;
      }
      for (const n of nodes) {
        const an = anchors.get(n.community);
        n.vx += (an.x - n.x) * 0.06 * alpha; n.vy += (an.y - n.y) * 0.06 * alpha;
        n.vx += (W / 2 - n.x) * 0.003 * alpha; n.vy += (H / 2 - n.y) * 0.003 * alpha;
        if (n.fixed) { n.vx = 0; n.vy = 0; continue; }
        n.vx *= 0.8; n.vy *= 0.8;
        n.x = Math.min(W - n.r - 4, Math.max(n.r + 4, n.x + n.vx));
        n.y = Math.min(H - n.r - 4, Math.max(n.r + 4, n.y + n.vy));
      }
    }
    return step;
  }

  function graph(viz) {
    const W = 1100, H = 760;
    const box = panel(t('admin.i_viz_graph'), t('admin.i_viz_graph_hint', { shown: viz.shown, total: viz.total, c: viz.communities }));
    box.classList.add('ri-chart--graph');
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ri-svg ri-svg--graph', role: 'img', 'aria-label': t('admin.i_viz_graph') });
    const pos = layout(viz.nodes, W, H);
    const nodes = viz.nodes.map((n) => ({ ...n, x: pos.get(n.id).x, y: pos.get(n.id).y, vx: 0, vy: 0, r: 5 + Math.min(11, Math.sqrt(n.games)), fixed: false }));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const groupIds = [...new Set(nodes.map((n) => n.community))].sort((a, b) => a - b);
    const anchors = new Map();
    groupIds.forEach((c, i) => {
      const a = (2 * Math.PI * i) / groupIds.length - Math.PI / 2;
      const R = groupIds.length > 1 ? Math.min(W, H) * 0.38 : 0;
      anchors.set(c, { x: W / 2 + R * Math.cos(a) * 1.3, y: H / 2 + R * Math.sin(a) });
    });
    const step = simulate(nodes, viz.edges, anchors, W, H);
    for (let i = 0, a = 1; i < 240; i++, a = Math.max(0.03, a * 0.97)) step(a);
    for (let i = 0; i < 120; i++) step(0); // forces off: only the no-overlap pass runs, so the layout ends clean

    const maxE = Math.max(1, ...viz.edges.map((e) => e.games));
    const hullLayer = svg('g', { class: 'ri-hulls' });
    const edgeLayer = svg('g');
    const nodeLayer = svg('g');
    const labelLayer = svg('g', { class: 'ri-labels' });
    s.append(hullLayer, edgeLayer, nodeLayer, labelLayer);

    const hulls = new Map();
    for (const c of groupIds.filter((g) => nodes.filter((n) => n.community === g).length > 1)) {
      const h = svg('circle', { class: 'ri-hull ' + slot(c) });
      hullLayer.appendChild(h);
      hulls.set(c, h);
    }
    const lines = viz.edges.map((e) => {
      const a = byId.get(e.a), b = byId.get(e.b);
      const ln = svg('line', { class: 'ri-edge' + (a.community === b.community ? '' : ' is-cross'), 'stroke-width': 0.8 + (2.6 * e.games) / maxE });
      ln.appendChild(svg('title', {}, `${a.name} – ${b.name}: ${t('admin.i_viz_n_games', { n: e.games })}`));
      edgeLayer.appendChild(ln);
      return { ln, a, b };
    });
    const circles = nodes.map((n) => {
      const c = svg('circle', { r: n.r, class: 'ri-node ri-node--drag ' + slot(n.community), tabindex: 0 });
      c.appendChild(svg('title', {}, `${n.name} · ${t('admin.i_viz_n_games', { n: n.games })} · ${n.rating} · ${t('admin.i_viz_group', { n: n.community + 1 })}`));
      nodeLayer.appendChild(c);
      return c;
    });
    const top = new Set([...nodes].sort((a, b) => b.games - a.games).slice(0, 6).map((n) => n.id));
    const labels = nodes.map((n) => {
      const l = svg('text', { class: 'ri-label' + (top.has(n.id) ? '' : ' is-hover'), 'text-anchor': 'middle' }, n.name.length > 14 ? n.name.slice(0, 13) + '…' : n.name);
      labelLayer.appendChild(l);
      return l;
    });

    function draw() {
      lines.forEach(({ ln, a, b }) => { ln.setAttribute('x1', a.x); ln.setAttribute('y1', a.y); ln.setAttribute('x2', b.x); ln.setAttribute('y2', b.y); });
      nodes.forEach((n, i) => {
        circles[i].setAttribute('cx', n.x); circles[i].setAttribute('cy', n.y);
        labels[i].setAttribute('x', n.x); labels[i].setAttribute('y', n.y + n.r + 12);
      });
      for (const [c, h] of hulls) {
        const m = nodes.filter((n) => n.community === c);
        const cx = m.reduce((q, n) => q + n.x, 0) / m.length, cy = m.reduce((q, n) => q + n.y, 0) / m.length;
        h.setAttribute('cx', cx); h.setAttribute('cy', cy);
        h.setAttribute('r', Math.max(...m.map((n) => Math.hypot(n.x - cx, n.y - cy) + n.r)) + 14);
      }
    }
    draw();

    const readout = document.createElement('div');
    readout.className = 'ri-readout';
    const idle = t('admin.i_viz_hint_idle');
    readout.textContent = idle;
    function focus(n) {
      const near = new Set([n.id]);
      lines.forEach(({ ln, a, b }) => { const on = a === n || b === n; ln.classList.toggle('is-on', on); ln.classList.toggle('is-off', !on); if (on) { near.add(a.id); near.add(b.id); } });
      nodes.forEach((m, i) => { circles[i].classList.toggle('is-off', !near.has(m.id)); labels[i].classList.toggle('is-show', near.has(m.id)); });
      readout.textContent = `${n.name} · ${t('admin.i_viz_n_games', { n: n.games })} · ${t('admin.i_viz_y_rating')} ${n.rating} · ${t('admin.i_viz_opponents', { n: n.opponents })} · ${t('admin.i_viz_group', { n: n.community + 1 })}`;
    }
    function blur() {
      lines.forEach(({ ln }) => ln.classList.remove('is-on', 'is-off'));
      circles.forEach((c) => c.classList.remove('is-off'));
      labels.forEach((l) => l.classList.remove('is-show'));
      readout.textContent = idle;
    }

    let alpha = 0, raf = 0;
    function tick() {
      raf = 0;
      step(alpha);
      alpha *= 0.96;
      draw();
      if (alpha > 0.03) raf = requestAnimationFrame(tick);
    }
    function heat(a) {
      alpha = Math.max(alpha, a);
      if (!raf && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(tick);
    }
    const toSvg = (ev) => {
      const m = s.getScreenCTM && s.getScreenCTM();
      if (!m) return { x: ev.clientX, y: ev.clientY };
      const p = s.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
      return p.matrixTransform(m.inverse());
    };
    circles.forEach((c, i) => {
      const n = nodes[i];
      let dragging = false;
      c.addEventListener('pointerenter', () => { if (!dragging) focus(n); });
      c.addEventListener('pointerleave', () => { if (!dragging) blur(); });
      c.addEventListener('focus', () => focus(n));
      c.addEventListener('blur', blur);
      c.addEventListener('pointerdown', (ev) => {
        dragging = true; n.fixed = true; c.classList.add('is-drag');
        if (c.setPointerCapture) { try { c.setPointerCapture(ev.pointerId); } catch (_) { /* synthetic event */ } }
        focus(n); heat(0.4); ev.preventDefault();
      });
      c.addEventListener('pointermove', (ev) => {
        if (!dragging) return;
        const p = toSvg(ev);
        n.x = Math.min(W - n.r, Math.max(n.r, p.x)); n.y = Math.min(H - n.r, Math.max(n.r, p.y));
        heat(0.3); draw();
      });
      const end = () => { if (!dragging) return; dragging = false; n.fixed = false; c.classList.remove('is-drag'); heat(0.3); };
      c.addEventListener('pointerup', end);
      c.addEventListener('pointercancel', end);
    });

    // Zoom / pan: the viewBox is the camera. Buttons, Ctrl/⌘+wheel (plain wheel keeps scrolling the page), drag the background to pan.
    const home = { x: 0, y: 0, w: W, h: H };
    let cam = { ...home };
    const applyCam = () => s.setAttribute('viewBox', `${cam.x} ${cam.y} ${cam.w} ${cam.h}`);
    function zoomBy(k, fx = 0.5, fy = 0.5) {
      const w = Math.min(W, Math.max(W / 6, cam.w / k)), h = w * (H / W);
      cam = { x: cam.x + (cam.w - w) * fx, y: cam.y + (cam.h - h) * fy, w, h };
      if (w >= W) cam = { ...home };
      applyCam();
    }
    const zoomBar = document.createElement('span');
    zoomBar.className = 'ri-zoom';
    for (const [label, key, fn] of [['−', 'admin.i_viz_zoom_out', () => zoomBy(1 / 1.4)], ['+', 'admin.i_viz_zoom_in', () => zoomBy(1.4)], ['1:1', 'admin.i_viz_zoom_reset', () => { cam = { ...home }; applyCam(); }]]) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pbtn pbtn--ghost pbtn--sm'; b.textContent = label;
      b.setAttribute('aria-label', t(key)); b.title = t(key);
      b.addEventListener('click', fn);
      zoomBar.appendChild(b);
    }
    s.addEventListener('wheel', (ev) => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      const r = s.getBoundingClientRect();
      zoomBy(ev.deltaY < 0 ? 1.15 : 1 / 1.15, (ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height);
    }, { passive: false });
    let pan = null;
    s.addEventListener('pointerdown', (ev) => {
      if (ev.target !== s && !ev.target.classList.contains('ri-hull')) return;
      pan = { x: ev.clientX, y: ev.clientY, cam: { ...cam } };
      s.classList.add('is-pan');
      if (s.setPointerCapture) { try { s.setPointerCapture(ev.pointerId); } catch (_) { /* synthetic event */ } }
    });
    s.addEventListener('pointermove', (ev) => {
      if (!pan) return;
      const r = s.getBoundingClientRect(), k = pan.cam.w / r.width;
      cam.x = Math.min(W - cam.w, Math.max(0, pan.cam.x - (ev.clientX - pan.x) * k));
      cam.y = Math.min(H - cam.h, Math.max(0, pan.cam.y - (ev.clientY - pan.y) * k));
      applyCam();
    });
    const endPan = () => { pan = null; s.classList.remove('is-pan'); };
    s.addEventListener('pointerup', endPan);
    s.addEventListener('pointercancel', endPan);

    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'pbtn pbtn--ghost pbtn--sm';
    reset.textContent = t('admin.i_viz_relayout');
    reset.addEventListener('click', () => { nodes.forEach((n) => { n.x = pos.get(n.id).x; n.y = pos.get(n.id).y; n.vx = n.vy = 0; }); alpha = 1; heat(1); });
    const bar = document.createElement('div');
    bar.className = 'ri-tools';
    bar.append(zoomBar, reset);
    box.querySelector('figcaption').appendChild(bar);

    box.appendChild(s);
    box.appendChild(readout);
    const legend = document.createElement('div');
    legend.className = 'ri-legend';
    const counts = new Map();
    for (const n of viz.nodes) counts.set(Math.min(n.community, SLOTS), (counts.get(Math.min(n.community, SLOTS)) || 0) + 1);
    for (const [c, k] of [...counts].sort((a, b) => a[0] - b[0])) {
      const item = document.createElement('span');
      const dot = document.createElement('span');
      dot.className = 'ri-dot ' + slot(c);
      item.append(dot, document.createTextNode(`${c >= SLOTS ? t('admin.i_viz_other') : t('admin.i_viz_group', { n: c + 1 })} · ${k}`));
      legend.appendChild(item);
    }
    box.appendChild(legend);
    const keys = document.createElement('div');
    keys.className = 'ri-legend ri-keys';
    for (const [cls, label] of [['ri-key-solid', 'admin.i_viz_key_solid'], ['ri-key-dash', 'admin.i_viz_key_dash'], ['ri-key-halo', 'admin.i_viz_key_halo'], ['ri-key-size', 'admin.i_viz_key_size']]) {
      const item = document.createElement('span');
      const mark = document.createElement('span');
      mark.className = 'ri-key ' + cls;
      item.append(mark, document.createTextNode(t(label)));
      keys.appendChild(item);
    }
    box.appendChild(keys);
    return box;
  }

  const ticks = (lo, hi, n) => Array.from({ length: n + 1 }, (_, i) => lo + ((hi - lo) * i) / n);

  function scatter(viz) {
    const W = 560, H = 300, L = 48, B = 34, T = 12, Rr = 14;
    const box = panel(t('admin.i_viz_scatter'), t('admin.i_viz_scatter_hint'));
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ri-svg', role: 'img', 'aria-label': t('admin.i_viz_scatter') });
    const pts = viz.nodes;
    const gx = (g) => Math.log10(g);
    const maxG = Math.max(10, ...pts.map((n) => n.games));
    const rs = pts.map((n) => n.rating);
    const lo = Math.floor((Math.min(1400, ...rs) - 20) / 50) * 50, hi = Math.ceil((Math.max(1600, ...rs) + 20) / 50) * 50;
    const X = (g) => L + ((gx(g) - 0) / (gx(maxG) || 1)) * (W - L - Rr);
    const Y = (r) => T + (1 - (r - lo) / (hi - lo)) * (H - T - B);
    for (const v of ticks(lo, hi, 4)) {
      s.appendChild(svg('line', { x1: L, x2: W - Rr, y1: Y(v), y2: Y(v), class: 'ri-grid' }));
      s.appendChild(svg('text', { x: L - 8, y: Y(v) + 4, class: 'ri-tick', 'text-anchor': 'end' }, String(Math.round(v))));
    }
    for (const g of [1, 10, 100, 1000].filter((v) => v <= maxG * 1.01)) {
      s.appendChild(svg('text', { x: X(g), y: H - B + 16, class: 'ri-tick', 'text-anchor': 'middle' }, String(g)));
    }
    s.appendChild(svg('text', { x: (L + W - Rr) / 2, y: H - 4, class: 'ri-axis', 'text-anchor': 'middle' }, t('admin.i_viz_x_games')));
    s.appendChild(svg('text', { x: 12, y: T + 8, class: 'ri-axis' }, t('admin.i_viz_y_rating')));
    for (const n of pts) {
      const c = svg('circle', { cx: X(n.games), cy: Y(n.rating), r: 5, class: 'ri-node ' + slot(n.community) });
      s.appendChild(tip(c, `${n.name} · ${t('admin.i_viz_n_games', { n: n.games })} · ${n.rating} · ${t('admin.i_viz_group', { n: n.community + 1 })}`));
    }
    box.appendChild(s);
    return box;
  }

  function histogram(title, bins, label) {
    const W = 270, H = 190, L = 28, B = 28, T = 10;
    const box = panel(title);
    const s = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'ri-svg', role: 'img', 'aria-label': title });
    const max = Math.max(1, ...bins.map((b) => b.count));
    const bw = (W - L - 4) / Math.max(1, bins.length);
    s.appendChild(svg('line', { x1: L, x2: W - 4, y1: H - B, y2: H - B, class: 'ri-grid' }));
    s.appendChild(svg('text', { x: L - 6, y: T + 4, class: 'ri-tick', 'text-anchor': 'end' }, String(max)));
    s.appendChild(svg('text', { x: L - 6, y: H - B, class: 'ri-tick', 'text-anchor': 'end' }, '0'));
    bins.forEach((b, i) => {
      const h = (b.count / max) * (H - B - T);
      const x = L + i * bw + 1;
      const bar = svg('rect', { x, y: H - B - h, width: Math.max(1, bw - 2), height: Math.max(b.count ? 2 : 0, h), rx: 3, class: 'ri-bar' });
      s.appendChild(tip(bar, `${label(b)}: ${b.count}`));
      if (bins.length <= 8 || i % 2 === 0) s.appendChild(svg('text', { x: x + (bw - 2) / 2, y: H - B + 14, class: 'ri-tick', 'text-anchor': 'middle' }, label(b, true)));
    });
    box.appendChild(s);
    return box;
  }

  function render(container, viz) {
    container.replaceChildren();
    if (!viz || !viz.nodes || !viz.nodes.length) { container.hidden = true; return; }
    container.hidden = false;
    const ratingLabel = (b, short) => (short ? String(b.from) : `${b.from}–${b.to}`);
    const gamesLabel = (b) => (b.to === null ? `${b.from}+` : b.from === b.to ? String(b.from) : `${b.from}–${b.to}`);
    const dist = document.createElement('div');
    dist.className = 'ri-dist';
    dist.append(histogram(t('admin.i_viz_dist_rating'), viz.ratingBins, ratingLabel), histogram(t('admin.i_viz_dist_games'), viz.gamesBins, gamesLabel));
    container.append(graph(viz), scatter(viz), dist);
  }

  window.IntegrityViz = { render };
})();
