'use strict';

(function () {
  const $ = (id) => document.getElementById(id);
  const labels = { hide: 'Ẩn nhóm', show: 'Hiện nhóm', lock: 'Khóa nhóm', unlock: 'Mở khóa', delete: 'Xóa nhóm',
    remove: 'Gỡ tin nhắn', dismiss: 'Bỏ qua báo cáo', uphold: 'Gỡ tin bị báo cáo' };
  let page = 1;
  let version = 0;
  // B481: club bodies are stored escaped (DmText.clean); decode for textContent, as club.js does.
  const decode = (txt) => (window.EscapeUtils ? window.EscapeUtils.decodeChatText(txt) : txt);
  function node(tag, text, cls) {
    const n = document.createElement(tag);
    n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  function button(text, handler) {
    const b = node('button', text, 'pbtn pbtn--sm');
    b.type = 'button';
    b.onclick = async () => {
      b.disabled = true;
      try { await handler(); } catch (e) { $('ac-status').textContent = e.message; } finally { b.disabled = false; }
    };
    return b;
  }
  async function api(path, body) {
    const opts = body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {};
    const res = await fetch('/api/admin/clubs' + path, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Không thể tải hội nhóm.');
    return data;
  }
  function action(slug, kind, id) {
    return button(labels[kind], async () => {
      if (!window.confirm(labels[kind] + ' · ' + slug + '?')) return;
      await api('/' + encodeURIComponent(slug) + '/actions', { action: kind, id });
      await list();
      if (kind !== 'delete') await detail(slug);
    });
  }
  async function detail(slug) {
    const token = ++version;
    const d = await api('/' + encodeURIComponent(slug));
    if (token !== version) return;
    const box = $('ac-detail');
    box.hidden = false;
    box.replaceChildren(node('h2', d.name), node('p', d.description), action(slug, d.hidden ? 'show' : 'hide'),
      action(slug, d.locked ? 'unlock' : 'lock'), action(slug, 'delete'), node('h3', 'Tin nhắn'));
    for (const m of d.messages) {
      const row = node('div', m.username + ' · ' + (m.body || m.kind), 'prow');
      row.append(action(slug, 'remove', m.id));
      box.append(row);
    }
    box.append(node('h3', 'Nhật ký hội nhóm'));
    for (const l of d.log) box.append(node('p', [new Date(l.at).toLocaleString(),l.actor?.username,l.type,l.target?.username,l.detail].filter(Boolean).join(' · ')));
    box.scrollIntoView({ block: 'start' });
  }
  async function list() {
    const token = ++version;
    const d = await api('?page=' + page + '&q=' + encodeURIComponent($('ac-query').value));
    if (token !== version) return;
    $('ac-detail').hidden = true;
    $('ac-status').textContent = d.total + ' hội nhóm';
    $('ac-list').replaceChildren(...d.clubs.map((c) => button(c.name + (c.hidden ? ' · Đã ẩn' : '') + (c.locked ? ' · Đã khóa' : ''), () => detail(c.slug))));
    $('ac-pages').replaceChildren();
    if (page > 1) $('ac-pages').append(button('Trang trước', () => { page--; return list(); }));
    if (page * 30 < d.total) $('ac-pages').append(button('Trang sau', () => { page++; return list(); }));
    $('ac-reports').replaceChildren(...d.reports.map((r) => {
      const row = node('div', [r.name, r.reason, decode(r.excerpt)].join(' · '), 'prow');
      // B475: earlier bodies (evidence an edit can't erase) and what the author did after the report.
      for (const p of r.prior || []) row.append(node('p', 'Bản trước: ' + decode(p.body), 'pnote'));
      if (r.later?.action === 'edited') row.append(node('p', 'Sau báo cáo, đã sửa thành: ' + decode(r.later.body), 'pnote'));
      if (r.later?.action === 'deleted') row.append(node('p', 'Sau báo cáo, đã xoá lúc ' + new Date(r.later.at).toLocaleString(), 'pnote'));
      row.append(action(r.slug, 'dismiss', r.id), action(r.slug, 'uphold', r.id));
      return row;
    }));
    $('ac-audit').replaceChildren(...d.history.map((l) => node('p', [new Date(l.created_at).toLocaleString(), l.username, labels[l.action] || l.action, l.slug, l.detail].filter(Boolean).join(' · '))));
  }
  window.AdminClubs = { init() {
    const refresh = () => list().catch((e) => { $('ac-status').textContent = e.message; });
    $('ac-search').onsubmit = (ev) => { ev.preventDefault(); page = 1; refresh(); };
    refresh();
  } };
})();
