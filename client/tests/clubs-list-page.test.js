/**
 * TODO.md #178 — clubs discover page. (Separate file from clubs-pages.test.js:
 * club.js's DOMContentLoaded listener would otherwise leak into this document.)
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/clubs.html"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const body = (file) => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const flush = () => new Promise((r) => setTimeout(r, 0));
const ok = (b) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(b) });

describe('clubs list page', () => {
  it('renders rows as text with links, hides create form when logged out', async () => {
    jest.resetModules();
    document.body.innerHTML = body('clubs.html');
    window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
    global.fetch = jest.fn((url) => (url.includes('/mine')
      ? Promise.resolve({ ok: false, status: 401 })
      : ok({ clubs: [{ slug: 'a-b', name: '<b>X</b>', description: '', joinPolicy: 'open', members: 3, avgRating: 1500, description: 'hi', rank: 2 }], pagination: { page: 1, totalPages: 1 } })));
  require('../js/platform-shell.js');
    require('../js/clubs.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush(); await flush();
    const a = document.querySelector('#cl-list .prow .prow__t');
    expect(a.textContent).toBe('<b>X</b>');
    expect(a.closest('a').getAttribute('href')).toBe('/c/a-b');
    expect([...document.querySelectorAll('#cl-list .prow__meta > span')].map((x) => x.textContent)).toEqual(['clubs.members{"n":3}', 'clubs.avg{"n":1500}']);
    expect(document.querySelector('#cl-list .prow__desc').textContent).toBe('hi');
    expect(document.querySelector('#cl-list .pbadge').textContent).toBe('clubs.rank_badge{"n":2}');
    expect(document.getElementById('cl-create-panel').hidden).toBe(true);
    expect(document.getElementById('cl-create-toggle').hidden).toBe(true);
    expect(document.querySelectorAll('#cl-tabs .ptab')).toHaveLength(1);
  });

  async function boot(listClubs, post) {
    jest.resetModules();
    document.body.innerHTML = body('clubs.html');
    window.t = (k, v) => k + (v ? JSON.stringify(v) : '');
    global.fetch = jest.fn((url, o) => {
      if (o && o.method === 'POST') return post;
      return url.includes('/mine') ? ok({ clubs: [] }) : ok({ clubs: listClubs, pagination: { page: 1, totalPages: 1 } });
    });
    require('../js/platform-shell.js');
    require('../js/clubs.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush(); await flush();
  }

  it('#322: open club has no policy badge, invite club has one', async () => {
    await boot([
      { slug: 'o', name: 'O', joinPolicy: 'open', members: 1, avgRating: 0, description: '' },
      { slug: 'i', name: 'I', joinPolicy: 'invite', members: 1, avgRating: 0, description: '' },
    ]);
    const [open, invite] = document.querySelectorAll('#cl-list .prow');
    expect(open.querySelectorAll('.pbadge')).toHaveLength(0);
    expect([...invite.querySelectorAll('.pbadge')].map((b) => b.textContent)).toEqual(['clubs.policy_invite_short']);
  });

  it('#323: create error marks #cl-name invalid + focused, red message with icon; cleared on input', async () => {
    await boot([], Promise.resolve({ ok: false, status: 409, json: () => Promise.resolve({ code: 'X', error: 'Tên CLB đã được dùng.' }) }));
    const name = document.getElementById('cl-name');
    document.getElementById('cl-form').dispatchEvent(new Event('submit', { cancelable: true }));
    await flush(); await flush();
    const msg = document.getElementById('cl-form-msg');
    expect(msg.textContent).toBe('Tên CLB đã được dùng.');
    expect(msg.getAttribute('role')).toBe('alert');
    expect(msg.classList.contains('pnote--error')).toBe(true);
    expect(msg.querySelector('svg.icon')).not.toBeNull();
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(name.getAttribute('aria-describedby')).toBe('cl-form-msg');
    expect(document.activeElement).toBe(name);
    name.dispatchEvent(new Event('input'));
    expect(name.hasAttribute('aria-invalid')).toBe(false);
    expect(msg.textContent).toBe('');
  });

  it('#324: search ring sits on the pill, not the inner input', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'platform.css'), 'utf8');
    expect(css).toMatch(/\.psearch:focus-within\s*\{[^}]*outline:\s*2px solid/);
    expect(css).toMatch(/\.psearch input:focus-visible\s*\{\s*outline:\s*0/);
    expect(css).toMatch(/max-width:\s*860px\)\s*\{\s*\.psearch\s*\{\s*min-height:\s*44px/);
  });

  it('#319: logged out makes no /clubs/mine request; with gvn_user it fetches and shows Mine', async () => {
    localStorage.removeItem('gvn_user');
    await boot([]);
    expect(global.fetch.mock.calls.some(([u]) => u.includes('/mine'))).toBe(false);
    expect(document.querySelectorAll('#cl-tabs .ptab')).toHaveLength(1);
    localStorage.setItem('gvn_user', '{"userId":1}');
    await boot([]);
    expect(global.fetch.mock.calls.some(([u]) => u.includes('/mine'))).toBe(true);
    expect(document.querySelectorAll('#cl-tabs .ptab')).toHaveLength(2);
    localStorage.removeItem('gvn_user');
  });

  it('#319: expired session (gvn_user set, /mine 401) falls back to discover only', async () => {
    localStorage.setItem('gvn_user', '{"userId":1}');
    jest.resetModules();
    document.body.innerHTML = body('clubs.html');
    window.t = (k) => k;
    global.fetch = jest.fn((url) => (url.includes('/mine') ? Promise.resolve({ ok: false, status: 401 }) : ok({ clubs: [], pagination: { page: 1, totalPages: 1 } })));
    require('../js/platform-shell.js'); require('../js/clubs.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush(); await flush();
    expect(document.querySelectorAll('#cl-tabs .ptab')).toHaveLength(1);
    localStorage.removeItem('gvn_user');
  });

  it('#320: rejected fetch and 500 both show the error and clear the list/pager', async () => {
    const mk = (n) => ({ slug: 's' + n, name: 'C' + n, joinPolicy: 'open', members: 1, avgRating: 0, description: '' });
    await boot([mk(1)]);
    expect(document.querySelectorAll('#cl-list .prow')).toHaveLength(1);
    for (const fail of [() => Promise.reject(new TypeError('Failed to fetch')), () => Promise.resolve({ ok: false, status: 500 })]) {
      global.fetch = jest.fn(fail);
      document.getElementById('cl-q').value = 'x';
      document.getElementById('cl-q').dispatchEvent(new Event('input'));
      await new Promise((r) => setTimeout(r, 300)); await flush();
      expect(document.getElementById('cl-status').textContent).toBe('clubs.error');
      expect(document.querySelectorAll('#cl-list .prow')).toHaveLength(0);
      expect(document.getElementById('cl-pager').children).toHaveLength(0);
    }
  });

  it('#321: description is its own clamped line; no description, no line', async () => {
    await boot([
      { slug: 'a', name: 'A', joinPolicy: 'open', members: 1, avgRating: 0, description: 'x'.repeat(208) },
      { slug: 'b', name: 'B', joinPolicy: 'open', members: 1, avgRating: 0, description: '' },
    ]);
    const [a, b] = document.querySelectorAll('#cl-list .prow');
    expect(a.querySelector('.prow__desc').textContent).toHaveLength(208);
    expect(b.querySelector('.prow__desc')).toBeNull();
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'platform.css'), 'utf8');
    expect(css).toMatch(/#cl-list \.prow__desc\s*\{[^}]*-webkit-line-clamp:\s*2/);
  });
});
