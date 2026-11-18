'use strict';

/**
 * early-hints-link.test.js — TODO.md #410.
 *
 * The lobby's `Link` header (replayed by Cloudflare Early Hints as 103) must list
 * exactly the resources index.html loads, with the same `?v=` hashes and the same
 * fetch mode, or the browser fetches twice and warns "preloaded but not used".
 */

const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');

const { collectHints, buildLinkHeader, indexLinkHints } = require('../config/earlyHints');
const { staticOptions } = require('../config/staticCache');

const clientPath = path.join(__dirname, '..', '..', 'client');
const INDEX_HTML = fs.readFileSync(path.join(clientPath, 'index.html'), 'utf8');

describe('collectHints mapping', () => {
  test.each([
    ['classic script', '<script src="js/a.js?v=1"></script>', { href: '/js/a.js?v=1', rel: 'preload', as: 'script' }],
    ['modulepreload link', '<link rel="modulepreload" href="js/m.js?v=3" />', { href: '/js/m.js?v=3', rel: 'modulepreload' }],
    ['stylesheet', '<link rel="stylesheet" href="css/x.css?v=4" />', { href: '/css/x.css?v=4', rel: 'preload', as: 'style' }],
    ['font preload', '<link rel="preload" href="f.woff2" as="font" type="font/woff2" crossorigin>',
      { href: '/f.woff2', rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: true }],
    ['absolute path kept', '<script src="/vendor/io.js"></script>', { href: '/vendor/io.js', rel: 'preload', as: 'script' }],
  ])('%s', (_n, html, expected) => {
    expect(collectHints(html)).toEqual([expected]);
  });

  test.each([
    ['icon', '<link rel="icon" href="a.svg" />'],
    ['manifest', '<link rel="manifest" href="m.webmanifest" />'],
    ['inline script', '<script>var a=1</script>'],
    ['off-origin', '<script src="https://x.example/a.js"></script>'],
    ['protocol-relative', '<script src="//x.example/a.js"></script>'],
    ['commented out', '<!-- <script src="js/old.js"></script> -->'],
    ['preload without as', '<link rel="preload" href="a.js">'],
    ['module entry script', '<script type="module" src="js/e.js?v=2"></script>'],
  ])('%s → no hint', (_n, html) => {
    expect(collectHints(html)).toEqual([]);
  });

  test('duplicates keep first position', () => {
    const hints = collectHints('<link rel="modulepreload" href="js/a.js?v=1"><script type="module" src="js/a.js?v=1"></script><script src="js/b.js"></script>');
    expect(hints.map((h) => h.href)).toEqual(['/js/a.js?v=1', '/js/b.js']);
  });

  test('classic script hint carries no crossorigin (same-origin, would mismatch)', () => {
    expect(buildLinkHeader('<script src="js/a.js?v=1"></script>')).toBe('</js/a.js?v=1>; rel=preload; as=script');
  });
});

describe('real client/index.html', () => {
  const hints = collectHints(INDEX_HTML);
  const byHref = new Map(hints.map((h) => [h.href, h]));
  const body = INDEX_HTML.replace(/<!--[\s\S]*?-->/g, '');

  test('every classic <script src> is hinted as=script with its exact ?v=', () => {
    const scripts = [...body.matchAll(/<script\b([^>]*)\bsrc="([^"]+)"/g)].filter(([, attrs]) => !/type="module"/.test(attrs));
    expect(scripts.length).toBeGreaterThan(5);
    for (const [, , src] of scripts) {
      expect(byHref.get(src.startsWith('/') ? src : '/' + src)).toEqual(expect.objectContaining({ rel: 'preload', as: 'script' }));
    }
  });

  test('every stylesheet / modulepreload / preload link is hinted', () => {
    const links = [...body.matchAll(/<link\s+rel="(stylesheet|modulepreload|preload)"[^>]*href="([^"]+)"/g)];
    expect(links.length).toBeGreaterThan(10);
    for (const [, , href] of links) expect(byHref.has('/' + href.replace(/^\//, ''))).toBe(true);
  });

  test('nothing hinted that the HTML does not load (no drift)', () => {
    for (const h of hints) expect(body).toContain(h.href.slice(1));
  });

  // Chrome on play3cr.win: "index-entry.js … preloaded using link preload but not used" — the
  // <script type=module> already fetched it before the Link-header copy (via the SW) was processed.
  test('module entry index-entry.js is not hinted at all (the #410 warning)', () => {
    expect(body).toMatch(/<script type="module" src="js\/index-entry\.js\?v=/);
    expect(hints.some((h) => h.href.startsWith('/js/index-entry.js'))).toBe(false);
  });

  test('font preload keeps crossorigin', () => {
    const font = hints.find((h) => h.as === 'font');
    expect(font).toMatchObject({ type: 'font/woff2', crossorigin: true });
  });
});

describe('indexLinkHints middleware over HTTP', () => {
  let server; let base;
  beforeAll((done) => {
    const app = express();
    app.use(indexLinkHints(clientPath));
    app.use(express.static(clientPath, staticOptions));
    server = app.listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; done(); });
  });
  afterAll((done) => { server.closeAllConnections(); server.close(done); });

  const get = (p, method = 'GET') => new Promise((resolve, reject) => {
    const req = http.request(base + p, { method, agent: false }, (res) => { res.resume(); res.on('end', () => resolve(res)); });
    req.on('error', reject);
    req.end();
  });

  test.each([['/', 'GET'], ['/index.html', 'GET'], ['/', 'HEAD']])('%s %s carries the Link header', async (p, method) => {
    const res = await get(p, method);
    expect(res.statusCode).toBe(200);
    expect(res.headers.link).toBe(buildLinkHeader(INDEX_HTML));
  });

  test.each(['/room.html', '/css/main.css', '/js/session.js'])('%s has no Link header', async (p) => {
    const res = await get(p);
    expect(res.headers.link).toBeUndefined();
  });
});
