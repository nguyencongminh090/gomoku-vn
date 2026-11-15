/**
 * TODO.md #206 (R8 8b) — /admin Users tab: list, search, role change, lock, change graph.
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/admin"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8')
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const flush = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 8; i++) await flush(); };
const $ = (id) => document.getElementById(id);
const ok = (b) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b) });
const fail = (status, b) => Promise.resolve({ ok: false, status, json: () => Promise.resolve(b || {}) });
const rejectRequest = () => Promise.reject(new Error('Offline'));
const deferred = () => {
  let resolve;
  const response = new Promise((done) => { resolve = done; });
  return { response, resolve };
};

const U = (id, over) => ({ id, username: id, displayName: id.toUpperCase(), role: 'member', locked: false, google: false, ...over });
const LIST = { users: [U('bob'), U('eve', { locked: true })], pagination: { page: 1, limit: 20, total: 2, totalPages: 1 } };
const DETAIL = (id, over) => ({
  user: U(id, over),
  nodes: [{ id, name: id.toUpperCase(), role: 'member' }, { id: 'boss', name: '<b>Boss</b>', role: 'admin' }],
  edges: [{ id: 'e1', from: 'boss', to: id, action: 'role_set', detail: { from: 'member', to: 'moderator' }, at: '2026-10-10T00:00:00.000Z' }],
});

function boot(impl) {
  jest.resetModules();
  document.body.innerHTML = HTML;
  $('adm-users').hidden = false;
  window.t = (k, v) => ({
    'err.admin_self_forbidden': 'You cannot change your own account.',
    'err.admin_forbidden': 'Admin permission required.',
  })[k] || k + (v ? JSON.stringify(v) : '');
  window.Forum = { pager: jest.fn() };
  global.fetch = jest.fn(impl);
  require('../js/admin-users.js');
  window.AdminUsers.init();
}
const routes = (over = {}) => (u, o = {}) => {
  const key = (o.method || 'GET') + ' ' + u.split('?')[0];
  if (over[key]) return over[key](u, o);
  if (key === 'GET /api/admin/users') return ok(LIST);
  if (key.startsWith('GET /api/admin/users/')) return ok(DETAIL(decodeURIComponent(u.split('/').pop())));
  return ok({});
};

describe('users tab', () => {
  it('lists users, marks locked ones, and renders names as text', async () => {
    boot(routes({ 'GET /api/admin/users': () => ok({ ...LIST, users: [U('bob', { displayName: '<i>Bob</i>' }), U('eve', { locked: true })] }) }));
    await settle();
    const rows = document.querySelectorAll('#us-list .us-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('b').textContent).toBe('<i>Bob</i>');
    expect(rows[0].querySelector('i')).toBeNull();
    expect(rows[1].textContent).toContain('admin.u_locked');
  });

  it('searching sends q (encoded) and resets to page 1', async () => {
    boot(routes());
    await settle();
    $('us-q').value = 'a&b';
    $('us-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect(global.fetch.mock.calls.at(-1)[0]).toBe('/api/admin/users?page=1&q=a%26b');
  });

  it('shows the latest search results even when the earlier request finishes last', async () => {
    const earlier = deferred();
    boot(routes({
      'GET /api/admin/users': (url) => url.endsWith('q=') ? earlier.response : ok({ ...LIST, users: [U('eve')] }),
    }));
    $('us-q').value = 'eve';
    $('us-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    earlier.resolve(ok(LIST));
    await settle();
    expect([...$('us-list').querySelectorAll('.us-row')].map((row) => row.dataset.id)).toEqual(['eve']);
  });

  it('reports a failed search and clears the preceding results', async () => {
    boot(routes({ 'GET /api/admin/users': (url) => url.endsWith('q=') ? ok(LIST) : rejectRequest() }));
    await settle();
    $('us-q').value = 'eve';
    $('us-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    expect($('us-msg').textContent).toBe('admin.error');
    expect($('us-msg').hidden).toBe(false);
    expect($('us-list').children).toHaveLength(0);
  });

  it('opening a user shows role, history and a graph with one node per person and one edge per change', async () => {
    boot(routes());
    await settle();
    document.querySelector('#us-list .us-row').click();
    await settle();
    expect($('us-detail').hidden).toBe(false);
    expect($('us-role').value).toBe('member');
    expect($('us-history').querySelectorAll('li')).toHaveLength(1);
    expect($('us-history').textContent).toContain('admin.u_edge_role_set');
    expect($('us-graph').querySelectorAll('circle')).toHaveLength(2);
    expect($('us-graph').querySelectorAll('line.us-edge--role_set')).toHaveLength(1);
    expect($('us-graph').querySelector('b')).toBeNull(); // names never become markup
    expect($('us-lock').textContent).toBe('admin.u_lock');
  });

  it('keeps the latest selected user when an earlier detail request finishes last', async () => {
    const earlier = deferred();
    boot(routes({ 'GET /api/admin/users/bob': () => earlier.response }));
    await settle();
    const [bob, eve] = $('us-list').querySelectorAll('.us-row');
    bob.click();
    eve.click();
    await settle();
    earlier.resolve(ok(DETAIL('bob')));
    await settle();
    expect($('us-name').textContent).toBe('EVE');
    expect($('us-list').querySelector('.is-active').dataset.id).toBe('eve');
  });

  it('shows a detail error with no user selected and allows retry', async () => {
    const first = jest.fn().mockImplementationOnce(rejectRequest).mockImplementation(() => ok(DETAIL('bob')));
    boot(routes({ 'GET /api/admin/users/bob': first }));
    await settle();
    const bob = $('us-list').querySelector('.us-row');
    bob.click();
    await settle();
    expect($('us-result').textContent).toBe('admin.error');
    expect($('us-result').hidden).toBe(false);
    expect($('us-result').closest('[hidden]')).toBeNull();
    expect($('us-detail').hidden).toBe(true);
    bob.click();
    await settle();
    expect($('us-detail').hidden).toBe(false);
    expect($('us-result').hidden).toBe(true);
  });

  it('changing the role POSTs it, then reloads the detail', async () => {
    let posted;
    boot(routes({ 'POST /api/admin/users/bob/role': (u, o) => { posted = JSON.parse(o.body); return ok({ user: U('bob', { role: 'moderator' }) }); } }));
    await settle();
    document.querySelector('#us-list .us-row').click();
    await settle();
    $('us-role').value = 'moderator';
    $('us-role').dispatchEvent(new Event('change'));
    await settle();
    expect(posted).toEqual({ role: 'moderator' });
    expect($('us-result').textContent).toBe('admin.u_saved');
  });

  it('a rejected role change shows the error and puts the select back', async () => {
    boot(routes({ 'POST /api/admin/users/bob/role': () => fail(400, { code: 'ADMIN_SELF_FORBIDDEN' }) }));
    await settle();
    document.querySelector('#us-list .us-row').click();
    await settle();
    $('us-role').value = 'admin';
    $('us-role').dispatchEvent(new Event('change'));
    await settle();
    expect($('us-result').textContent).toBe('You cannot change your own account.');
    expect($('us-role').value).toBe('member');
  });

  it('prevents another mutation while saving and restores controls after a network error', async () => {
    const post = deferred();
    const lock = jest.fn(() => ok({}));
    boot(routes({ 'POST /api/admin/users/bob/role': () => post.response, 'POST /api/admin/users/bob/lock': lock }));
    await settle();
    $('us-list').querySelector('.us-row').click();
    await settle();
    $('us-role').value = 'moderator';
    $('us-role').dispatchEvent(new Event('change'));
    expect($('us-lock').disabled).toBe(true);
    expect($('us-role').disabled).toBe(true);
    $('us-lock').click();
    expect(lock).not.toHaveBeenCalled();
    post.resolve(rejectRequest());
    await settle();
    expect($('us-result').textContent).toBe('admin.error');
    expect($('us-role').value).toBe('member');
    expect($('us-lock').disabled).toBe(false);
  });

  it('reports when a saved change cannot be reloaded and clears the stale detail', async () => {
    const detail = jest.fn().mockImplementationOnce(() => ok(DETAIL('bob'))).mockImplementation(rejectRequest);
    boot(routes({ 'GET /api/admin/users/bob': detail }));
    await settle();
    $('us-list').querySelector('.us-row').click();
    await settle();
    $('us-role').value = 'moderator';
    $('us-role').dispatchEvent(new Event('change'));
    await settle();
    expect($('us-detail').hidden).toBe(true);
    expect($('us-result').textContent).toBe('admin.u_saved admin.error');
    expect($('us-result').closest('[hidden]')).toBeNull();
  });

  it('lock sends the reason; a locked user offers unlock and hides the reason box', async () => {
    let posted;
    boot(routes({ 'POST /api/admin/users/bob/lock': (u, o) => { posted = JSON.parse(o.body); return ok({ user: U('bob', { locked: true }) }); } }));
    await settle();
    document.querySelector('#us-list .us-row').click();
    await settle();
    $('us-reason').value = 'spam';
    $('us-lock').click();
    await settle();
    expect(posted).toEqual({ locked: true, reason: 'spam' });

    boot(routes({ 'GET /api/admin/users/eve': () => ok(DETAIL('eve', { locked: true })) }));
    await settle();
    document.querySelectorAll('#us-list .us-row')[1].click();
    await settle();
    expect($('us-lock').textContent).toBe('admin.u_unlock');
    expect($('us-reason').hidden).toBe(true);
  });

  it('a non-admin (403) sees the error, no rows', async () => {
    boot(routes({ 'GET /api/admin/users': () => fail(403, { code: 'ADMIN_FORBIDDEN' }) }));
    await settle();
    expect($('us-msg').hidden).toBe(false);
    expect($('us-msg').textContent).toBe('Admin permission required.');
    expect(document.querySelectorAll('#us-list .us-row')).toHaveLength(0);
  });

  it('shows the avatar with a remove button only when one exists; removing confirms then DELETEs', async () => {
    let deleted = false;
    window.confirm = jest.fn(() => true);
    boot(routes({
      'GET /api/admin/users/bob': () => ok(DETAIL('bob', { avatarUrl: '/api/profile/avatar/bob.webp?v=1' })),
      'DELETE /api/admin/users/bob/avatar': () => { deleted = true; return ok({ user: U('bob') }); },
    }));
    await settle();
    document.querySelectorAll('#us-list .us-row')[0].click();
    await settle();
    expect($('us-avatar').hidden).toBe(false);
    expect($('us-avatar-img').getAttribute('src')).toBe('/api/profile/avatar/bob.webp?v=1');
    $('us-avatar-remove').click();
    await settle();
    expect(window.confirm).toHaveBeenCalled();
    expect(deleted).toBe(true);
  });

  it('declining the confirm sends nothing; no avatar → block hidden', async () => {
    window.confirm = jest.fn(() => false);
    boot(routes({ 'GET /api/admin/users/bob': () => ok(DETAIL('bob', { avatarUrl: '/a.webp?v=1' })), 'GET /api/admin/users/eve': () => ok(DETAIL('eve')) }));
    await settle();
    document.querySelectorAll('#us-list .us-row')[0].click();
    await settle();
    $('us-avatar-remove').click();
    await settle();
    expect(global.fetch.mock.calls.some(([, o]) => o && o.method === 'DELETE')).toBe(false);
    document.querySelectorAll('#us-list .us-row')[1].click();
    await settle();
    expect($('us-avatar').hidden).toBe(true);
  });
});
