/**
 * TODO.md #263 — the lobby's REST calls used to start only after the whole
 * ES-module graph had loaded (~340 ms after the first JS request on a cold
 * load). api-early.js starts them from a classic <head> script and the modules
 * take the in-flight response instead of requesting again.
 *
 * Guards: no request for a signed-out browser (requireAuth is about to bounce
 * it), each URL only under its consumer's own condition, a taken response is
 * handed out once (polls fetch fresh), and the <head> ordering that makes it
 * early at all.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CLIENT_DIR = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(CLIENT_DIR, ...p), 'utf8');

const SESSION_JS = read('js', 'session.js');
const API_EARLY_JS = read('js', 'api-early.js');
const INDEX_HTML = read('index.html');

const ALL = ['/api/home', '/api/clubs/mine', '/api/shell']; // B269: /api/shell = notifications + rankings/me + admin/me

function boot({ user = null, hash = '', search = '', hidden = false } = {}) {
  localStorage.clear();
  if (user) localStorage.setItem('gvn_user', JSON.stringify(user));
  history.replaceState(null, '', '/index.html' + search + hash);
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  delete window.GvnEarly;
  const calls = [];
  window.fetch = jest.fn((url, init) => {
    calls.push({ url, init });
    const n = calls.length;
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ n }) });
  });
  window.eval(SESSION_JS);
  window.eval(API_EARLY_JS);
  return calls;
}

const MEMBER = { userId: 'u1', displayName: 'A', isGuest: false };
const GUEST = { userId: 'g1', displayName: 'Khách', isGuest: true };

describe('api-early.js — which requests start during parsing', () => {
  test('signed-out browser: nothing (login.html bounce is coming)', () => {
    expect(boot()).toEqual([]);
  });

  test('legacy-token-only browser: nothing (migration first, modules fetch as before)', () => {
    const calls = boot();
    localStorage.setItem('gvn_token', 'x');
    delete window.GvnEarly;
    window.eval(API_EARLY_JS);
    expect(calls).toEqual([]);
  });

  test('member on home: all three, same-origin credentials', () => {
    const calls = boot({ user: MEMBER });
    expect(calls.map((c) => c.url).sort()).toEqual([...ALL].sort());
    for (const c of calls) expect(c.init).toEqual({ credentials: 'same-origin' });
  });

  test('guest on home: only /api/home and /api/clubs/mine (the shell call is members-only)', () => {
    expect(boot({ user: GUEST }).map((c) => c.url).sort()).toEqual(['/api/clubs/mine', '/api/home']);
  });

  test.each([
    ['#rooms', ''],
    ['#tournaments', ''],
    ['', '?tab=tournaments'],
  ])('not the home screen (hash %p search %p): no /api/home', (hash, search) => {
    const urls = boot({ user: MEMBER, hash, search }).map((c) => c.url);
    expect(urls).not.toContain('/api/home');
    expect(urls).toContain('/api/shell');
  });

  test('hidden tab still starts /api/shell (it also carries me + admin)', () => {
    expect(boot({ user: MEMBER, hidden: true }).map((c) => c.url)).toContain('/api/shell');
  });

  test('expired gvn_user counts as signed out', () => {
    expect(boot({ user: { ...MEMBER, expiresAt: '2000-01-01T00:00:00Z' } })).toEqual([]);
  });
});

describe('api-early.js — handing the response to the module', () => {
  test('first GvnEarly.fetch takes the early promise; the next one (a poll) fetches fresh', async () => {
    const calls = boot({ user: MEMBER });
    const before = calls.length;
    const first = await window.GvnEarly.fetch('/api/home', { credentials: 'same-origin' });
    expect(calls.length).toBe(before); // no second request
    const second = await window.GvnEarly.fetch('/api/home', { credentials: 'same-origin' });
    expect(calls.length).toBe(before + 1);
    expect(await first.json()).not.toEqual(await second.json());
  });

  test('a URL never started early falls through to a real fetch', async () => {
    const calls = boot({ user: GUEST });
    await window.GvnEarly.fetch('/api/admin/me', { credentials: 'same-origin' });
    expect(calls.map((c) => c.url)).toContain('/api/admin/me');
  });

  test('a rejected early request reaches the consumer as a rejection, not an unhandled one', async () => {
    localStorage.setItem('gvn_user', JSON.stringify(MEMBER));
    delete window.GvnEarly;
    window.fetch = jest.fn(() => Promise.reject(new Error('offline')));
    window.eval(API_EARLY_JS);
    await expect(window.GvnEarly.fetch('/api/home', {})).rejects.toThrow('offline');
  });
});

describe('consumers take the early response', () => {
  test.each([
    ['lobby-home.js', '/api/home'],
    ['tournaments.js', '/api/clubs/mine'],
    ['platform-shell.js', '/api/shell'],
  ])('%s fetches %s through GvnEarly', (file, url) => {
    const src = read('js', file);
    expect(src).toMatch(/window\.GvnEarly \? window\.GvnEarly\.fetch\(/);
    // every line calling this URL goes through GvnEarly (directly or via platform-shell's earlyFetch):
    // a plain fetch('<url>') would be the double request this item removes
    const lines = src.split('\n').filter((l) => l.includes("'" + url + "'") && /fetch\(/i.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(l).toMatch(/GvnEarly|earlyFetch\(/);
  });
});

describe('index.html <head> ordering', () => {
  const pos = (needle) => INDEX_HTML.indexOf(needle);

  test('api-early.js after session.js and above every stylesheet', () => {
    const early = pos('js/api-early.js');
    expect(early).toBeGreaterThan(-1);
    expect(early).toBeGreaterThan(pos('js/session.js'));
    expect(early).toBeLessThan(INDEX_HTML.search(/<link rel="stylesheet" href=/));
  });

  test('font woff2 preloads: crossorigin, real files, URLs the family style.css uses (Nunito)', () => {
    const links = INDEX_HTML.match(/<link rel="preload"[^>]*as="font"[^>]*>/g) || [];
    expect(links.length).toBe(1);
    for (const l of links) {
      expect(l).toMatch(/\scrossorigin[\s>]/);
      const href = l.match(/href="([^"]+)"/)[1];
      expect(fs.existsSync(path.join(CLIENT_DIR, href))).toBe(true);
      const family = href.split('/')[2];
      expect(['nunito']).toContain(family);
      const css = read('vendor', 'fonts', family, 'style.css');
      expect(css).toContain("url('./" + path.basename(href) + "')");
    }
  });
});
