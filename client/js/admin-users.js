/**
 * admin-users.js — Users tab of /admin (R8 8b, #206). Admin-only: the API answers 403 otherwise.
 * GET /api/admin/users?q=&page=, GET /users/:id → {user, nodes, edges}, POST /users/:id/role,
 * POST /users/:id/lock. The change log is drawn as a radial graph (user in the centre, everyone
 * who changed them or whom they changed around it) plus a plain list. All names via textContent.
 * Exposes window.AdminUsers.init(); admin.js starts it when the tab is first shown.
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  const ROLES = ['member', 'moderator', 'admin'];
  const SVGNS = 'http://www.w3.org/2000/svg';

  let started = false;
  let page = 1;
  let q = '';
  let current = null;   // { user, nodes, edges }
  let busy = false;

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  function svg(tag, attrs, text) {
    const n = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
    if (text !== undefined) n.textContent = text;
    return n;
  }

  const apiError = (data) => (data && data.code ? t('err.' + data.code.toLowerCase()) : t('admin.error'));

  async function send(method, url, body) {
    const res = await fetch(url, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { ok: res.ok, status: res.status, data: await res.json().catch(() => ({})) };
  }

  function say(msg, good) {
    const r = $('us-result');
    r.hidden = !msg;
    r.className = 'pz-result ' + (good ? 'is-right' : 'is-wrong');
    r.textContent = msg || '';
  }

  const nameOf = (nodes, id) => (nodes.find((n) => n.id === id) || { name: '?' }).name;
  const describe = (e, nodes) => t('admin.u_edge_' + e.action, {
    actor: nameOf(nodes, e.from), target: nameOf(nodes, e.to), from: e.detail.from, to: e.detail.to, reason: e.detail.reason || '',
  });

  /** Radial layout: centre = selected user, the other nodes evenly on a circle; one line per edge. */
  function drawGraph(data) {
    const g = $('us-graph');
    g.replaceChildren();
    const cx = 160, cy = 120, R = 85;
    const others = data.nodes.filter((n) => n.id !== data.user.id);
    const pos = new Map([[data.user.id, { x: cx, y: cy }]]);
    others.forEach((n, i) => {
      const a = (2 * Math.PI * i) / Math.max(others.length, 1) - Math.PI / 2;
      pos.set(n.id, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) });
    });
    // Parallel edges between the same pair are fanned out so they stay distinguishable.
    const seen = new Map();
    for (const e of data.edges) {
      const a = pos.get(e.from), b = pos.get(e.to);
      if (!a || !b) continue;
      const key = [e.from, e.to].sort().join('|');
      const k = seen.get(key) || 0;
      seen.set(key, k + 1);
      const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
      const off = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 6;
      const ox = (-dy / len) * off, oy = (dx / len) * off;
      const line = svg('line', { x1: a.x + ox, y1: a.y + oy, x2: b.x + ox, y2: b.y + oy, class: 'us-edge us-edge--' + e.action });
      line.appendChild(svg('title', {}, describe(e, data.nodes)));
      g.appendChild(line);
    }
    for (const n of data.nodes) {
      const p = pos.get(n.id);
      const self = n.id === data.user.id;
      const c = svg('circle', { cx: p.x, cy: p.y, r: self ? 16 : 12, class: 'us-node' + (self ? ' us-node--self' : '') });
      c.appendChild(svg('title', {}, n.name + (n.role ? ' · ' + t('admin.role_' + n.role) : '')));
      if (!self && !n.deleted) c.addEventListener('click', () => open(n.id));
      g.append(c, svg('text', { x: p.x, y: p.y + (self ? 28 : 24) }, n.name.length > 12 ? n.name.slice(0, 11) + '…' : n.name));
    }
  }

  function render(data) {
    current = data;
    const u = data.user;
    $('us-detail').hidden = false;
    $('us-name').textContent = u.displayName;
    $('us-meta').textContent = u.username + (u.google ? ' · Google' : '') + (u.locked ? ' · ' + t('admin.u_locked') : '');
    $('us-role').value = u.role;
    $('us-lock').textContent = t(u.locked ? 'admin.u_unlock' : 'admin.u_lock');
    $('us-reason').hidden = $('us-reason').previousElementSibling.hidden = u.locked;
    $('us-reason').value = '';
    say('');
    const hist = $('us-history');
    hist.replaceChildren();
    if (!data.edges.length) hist.appendChild(el('li', t('admin.u_no_history'), 'muted'));
    for (const e of data.edges) hist.appendChild(el('li', describe(e, data.nodes) + ' — ' + new Date(e.at).toLocaleString()));
    drawGraph(data);
    document.querySelectorAll('#us-list .us-row').forEach((r) => r.classList.toggle('is-active', r.dataset.id === u.id));
  }

  async function open(id) {
    const res = await send('GET', '/api/admin/users/' + encodeURIComponent(id));
    if (!res.ok) { say(apiError(res.data)); return; }
    render(res.data);
  }

  async function load() {
    const msg = $('us-msg');
    const res = await send('GET', '/api/admin/users?page=' + page + '&q=' + encodeURIComponent(q));
    if (!res.ok) { msg.hidden = false; msg.textContent = apiError(res.data); return; }
    const list = $('us-list');
    list.replaceChildren();
    for (const u of res.data.users) {
      const r = el('button', undefined, 'prow us-row' + (current && current.user.id === u.id ? ' is-active' : ''));
      r.type = 'button';
      r.dataset.id = u.id;
      r.append(el('b', u.displayName), el('span', u.username, 'muted small'), el('span', t('admin.role_' + u.role), 'pbadge'));
      if (u.locked) r.appendChild(el('span', t('admin.u_locked'), 'pbadge pz-dup'));
      r.addEventListener('click', () => open(u.id));
      list.appendChild(r);
    }
    msg.hidden = res.data.users.length > 0;
    msg.textContent = t('admin.u_none');
    window.Forum && window.Forum.pager($('us-pager'), res.data.pagination, (p) => { page = p; load(); });
  }

  async function change(fn) {
    if (busy || !current) return;
    busy = true;
    try {
      const res = await fn();
      if (!res.ok) { say(apiError(res.data)); $('us-role').value = current.user.role; return; }
      await open(current.user.id);
      say(t('admin.u_saved'), true);
      load();
    } finally { busy = false; }
  }

  function init() {
    if (started) return;
    started = true;
    const sel = $('us-role');
    for (const r of ROLES) { const o = el('option', t('admin.role_' + r)); o.value = r; sel.appendChild(o); }
    $('us-form').addEventListener('submit', (e) => { e.preventDefault(); q = $('us-q').value.trim(); page = 1; load(); });
    sel.addEventListener('change', () => change(() => send('POST', '/api/admin/users/' + encodeURIComponent(current.user.id) + '/role', { role: sel.value })));
    $('us-lock').addEventListener('click', () => change(() => send('POST', '/api/admin/users/' + encodeURIComponent(current.user.id) + '/lock',
      { locked: !current.user.locked, reason: $('us-reason').value })));
    load();
  }

  window.AdminUsers = { init };
})();
