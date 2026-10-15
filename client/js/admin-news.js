/**
 * admin-news.js — "Tin tức" tab of /admin (#224). The dashboard shows the newest item as one line.
 * GET/POST /api/admin/news, PUT/DELETE /api/admin/news/:id (perm news.manage: admin only; the
 * server checks the role on every call). Plain text in and out (textContent). Exposes window.AdminNews.init().
 */

'use strict';

(function () {
  const t = (key, vars) => (typeof window.t === 'function' ? window.t(key, vars) : key);
  const $ = (id) => document.getElementById(id);
  let started = false;
  let editing = null; // id of the item in the form, or null for a new one

  function el(tag, text, cls) {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  const apiError = (data) => (data && data.code ? t('err.' + data.code.toLowerCase()) : t('admin.error'));

  function note(text) {
    const m = $('nw-msg');
    m.hidden = !text;
    m.textContent = text || '';
  }

  function resetForm() {
    editing = null;
    $('nw-body').value = '';
    $('nw-link').value = '';
    $('nw-save').textContent = t('admin.n_publish');
    $('nw-cancel').hidden = true;
  }

  function edit(item) {
    editing = item.id;
    $('nw-body').value = item.body;
    $('nw-link').value = item.link || '';
    $('nw-save').textContent = t('admin.n_update');
    $('nw-cancel').hidden = false;
    $('nw-body').focus();
  }

  async function call(method, url, body) {
    const res = await fetch(url, {
      method, credentials: 'same-origin',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    return { ok: res.ok, data: await res.json().catch(() => ({})) };
  }

  function row(item, i) {
    const box = el('div', undefined, 'prow');
    const body = el('div', undefined, 'prow__body');
    body.append(el('div', item.body, 'prow__t'));
    const meta = [new Date(item.createdAt).toLocaleString()];
    if (item.link) meta.push(item.link);
    if (i === 0) meta.unshift(t('admin.n_live'));
    const metaEl = el('div', undefined, 'prow__meta');
    for (const p of meta) metaEl.append(el('span', p));
    body.append(metaEl);
    const actions = el('div', undefined, 'pactions');
    const btn = (label, cls, fn) => { const b = el('button', label, cls); b.type = 'button'; b.addEventListener('click', () => fn(b)); return b; };
    actions.append(
      btn(t('admin.n_edit'), 'pbtn pbtn--ghost pbtn--sm', () => edit(item)),
      btn(t('admin.n_delete'), 'pbtn pbtn--ghost pbtn--sm', async (b) => {
        if (!window.confirm(t('admin.n_delete_confirm'))) return;
        b.disabled = true;
        const r = await call('DELETE', '/api/admin/news/' + encodeURIComponent(item.id));
        if (!r.ok) { b.disabled = false; return note(apiError(r.data)); }
        if (editing === item.id) resetForm();
        load();
      }),
    );
    box.append(body, actions);
    return box;
  }

  async function load() {
    try {
      const r = await call('GET', '/api/admin/news');
      if (!r.ok) { $('nw-list').replaceChildren(); return note(apiError(r.data)); }
      $('nw-list').replaceChildren(...r.data.items.map(row));
      if (!r.data.items.length) $('nw-list').appendChild(el('p', t('admin.n_empty'), 'muted small'));
    } catch (err) {
      note(t('admin.error'));
    }
  }

  async function save(e) {
    e.preventDefault();
    const btn = $('nw-save');
    btn.disabled = true;
    note('');
    const payload = { body: $('nw-body').value, link: $('nw-link').value.trim() };
    try {
      const r = editing
        ? await call('PUT', '/api/admin/news/' + encodeURIComponent(editing), payload)
        : await call('POST', '/api/admin/news', payload);
      if (!r.ok) return note(apiError(r.data));
      resetForm();
      load();
    } catch (err) {
      note(t('admin.error'));
    } finally {
      btn.disabled = false;
    }
  }

  window.AdminNews = {
    init() {
      if (started) return;
      started = true;
      $('nw-form').addEventListener('submit', save);
      $('nw-cancel').addEventListener('click', resetForm);
      resetForm();
      load();
    },
  };
})();
