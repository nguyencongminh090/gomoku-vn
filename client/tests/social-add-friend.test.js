/**
 * Add a friend by username / display name on the Bạn bè page (search box → rows → send request).
 *
 * @jest-environment jsdom
 * @jest-environment-options {"url": "http://localhost/social.html"}
 */

'use strict';

const fs = require('fs');
const path = require('path');

const bodyOf = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')
  .match(/<body[^>]*>([\s\S]*)<\/body>/i)[1].replace(/<script[\s\S]*?<\/script>/g, '');
const json = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const tick = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const P = (username, status, canRequest = true) => ({ username, displayName: username.toUpperCase(), avatarUrl: null, status, canRequest });

let calls;
function boot(results) {
  jest.resetModules();
  jest.useFakeTimers({ doNotFake: ['nextTick'] });
  document.body.innerHTML = '<div id="pl-shell"></div>' + bodyOf('social.html');
  window.t = (k) => k;
  window.GvnSession = { getUser: () => ({ userId: 'u1', displayName: 'Me', isGuest: false }) };
  calls = [];
  global.fetch = jest.fn((url, opts) => {
    const method = (opts && opts.method) || 'GET';
    calls.push(method + ' ' + url);
    if (url.startsWith('/api/friends/search')) return json({ results });
    if (url === '/api/friends/code') return json({ code: 'me#0042' });
    if (url === '/api/friends') return json({ friends: [], incoming: [], outgoing: [] });
    if (method === 'POST') return json({ status: 'outgoing' }, 201);
    return json({}, 404);
  });
  require('../js/platform-shell.js');
  require('../js/social.js');
  document.dispatchEvent(new Event('DOMContentLoaded'));
}
const type = (v) => { const i = document.getElementById('sc-add-q'); i.value = v; i.dispatchEvent(new Event('input')); };
const rows = () => [...document.querySelectorAll('#sc-add-results .prow')];

afterEach(() => { jest.useRealTimers(); });

describe('add friend search', () => {
  it('does not search below 2 chars; debounces; renders the right control per relation', async () => {
    boot([P('bob', 'none'), P('cat', 'none', false), P('dan', 'friends'), P('eve', 'outgoing'), P('fay', 'incoming')]);
    await tick();
    type('b'); jest.advanceTimersByTime(400); await tick();
    expect(calls.some((c) => c.includes('/search'))).toBe(false);
    type('bo'); type('bob'); jest.advanceTimersByTime(400); await tick();
    expect(calls.filter((c) => c.includes('/search'))).toEqual(['GET /api/friends/search?q=bob']);
    const r = rows();
    expect(r.map((x) => x.querySelector('.prow__t').textContent)).toEqual(['BOB', 'CAT', 'DAN', 'EVE', 'FAY']);
    expect(r[0].querySelector('button').textContent).toBe('social.add_btn');
    expect(r[1].querySelector('button')).toBeNull();
    expect(r[1].textContent).toContain('social.add_closed');
    expect(r[2].textContent).toContain('social.add_friends');
    expect(r[3].textContent).toContain('social.add_sent');
    expect(r[4].querySelector('button').textContent).toBe('friends.accept');
  });

  it('clicking Add friend POSTs the username (URL-encoded) and refreshes', async () => {
    boot([P('bob', 'none')]);
    await tick();
    type('bo'); jest.advanceTimersByTime(400); await tick();
    const before = calls.filter((c) => c.includes('/search')).length;
    rows()[0].querySelector('button').click(); await tick();
    expect(calls).toContain('POST /api/friends/bob');
    expect(calls.filter((c) => c.includes('/search')).length).toBeGreaterThan(before); // re-queried to show the new state
  });

  it('shows "none found" and renders names as text, not HTML', async () => {
    boot([]);
    await tick();
    type('zz'); jest.advanceTimersByTime(400); await tick();
    expect(document.getElementById('sc-add-results').textContent).toBe('social.add_none');
    boot([{ ...P('x', 'none'), displayName: '<img src=x onerror=1>' }]);
    await tick();
    type('xx'); jest.advanceTimersByTime(400); await tick();
    expect(document.querySelector('#sc-add-results img')).toBeNull();
  });
});

describe('my friend code', () => {
  it('shows my name#tag and copies it', async () => {
    boot([]);
    const writeText = jest.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await tick();
    expect(document.getElementById('sc-code').textContent).toBe('me#0042');
    document.getElementById('sc-code-copy').click(); await tick();
    expect(writeText).toHaveBeenCalledWith('me#0042');
  });
});

describe('css', () => {
  it('the add-friend form class is not shared with another component (a clash shrank the box to 180px)', () => {
    const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'platform.css'), 'utf8');
    const cls = /<form id="sc-add" class="([\w-]+)"/.exec(fs.readFileSync(path.join(__dirname, '..', 'social.html'), 'utf8'))[1];
    const defs = css.split('\n').filter((l) => new RegExp('^\\.' + cls + '[\\s{]').test(l));
    expect(defs.length).toBe(2); // the form rule + its "input" rule, nothing else
    expect(defs.every((l) => !/display:\s*flex|width:\s*180px/.test(l))).toBe(true);
  });
});
