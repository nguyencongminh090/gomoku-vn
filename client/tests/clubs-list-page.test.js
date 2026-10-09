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
      : ok({ clubs: [{ slug: 'a-b', name: '<b>X</b>', description: '', joinPolicy: 'open', members: 3, avgRating: null }], pagination: { page: 1, totalPages: 1 } })));
    require('../js/clubs.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    await flush(); await flush();
    const a = document.querySelector('#cl-list a');
    expect(a.textContent).toBe('<b>X</b>');
    expect(a.getAttribute('href')).toBe('/c/a-b');
    expect(document.getElementById('cl-create-panel').hidden).toBe(true);
  });
});
