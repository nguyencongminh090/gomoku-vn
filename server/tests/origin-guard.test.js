'use strict';

/** #350: cross-site writes to /api are rejected; same-origin and header-less pass. */

const fs = require('fs');
const path = require('path');
const express = require('express');
const { originGuard } = require('../middleware/origin-guard');

const servers = [];
let savedCors;
beforeEach(() => { savedCors = process.env.CORS_ORIGIN; delete process.env.CORS_ORIGIN; });
afterEach(async () => {
  if (savedCors === undefined) delete process.env.CORS_ORIGIN; else process.env.CORS_ORIGIN = savedCors;
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => { s.closeAllConnections(); s.close(r); })));
});

function listen(app) {
  return new Promise((r) => { const s = app.listen(0, () => { servers.push(s); r(s); }); });
}

async function call(method, headers = {}) {
  const app = express();
  app.use('/api', originGuard);
  app.all('/api/x', (req, res) => res.json({ ok: true }));
  const server = await listen(app);
  const host = `127.0.0.1:${server.address().port}`;
  const res = await fetch(`http://${host}/api/x`, { method, headers: { host, ...headers } });
  return { status: res.status, body: await res.json(), host };
}

describe('originGuard', () => {
  test('cross-site Origin on POST → 403 CROSS_SITE_BLOCKED', async () => {
    const r = await call('POST', { origin: 'https://evil.example' });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('CROSS_SITE_BLOCKED');
  });

  test.each(['PUT', 'PATCH', 'DELETE'])('cross-site %s blocked', async (m) => {
    expect((await call(m, { origin: 'https://evil.example' })).status).toBe(403);
  });

  test('cross-site Sec-Fetch-Site without Origin → 403', async () => {
    expect((await call('POST', { 'sec-fetch-site': 'cross-site' })).status).toBe(403);
    expect((await call('POST', { 'sec-fetch-site': 'same-site' })).status).toBe(403);
  });

  test('same-origin Origin (host match, any scheme) passes', async () => {
    const app = express();
    app.use('/api', originGuard);
    app.post('/api/x', (req, res) => res.json({ ok: true }));
    const server = await listen(app);
    const host = `127.0.0.1:${server.address().port}`;
    const res = await fetch(`http://${host}/api/x`, { method: 'POST', headers: { origin: `https://${host}`, 'sec-fetch-site': 'same-origin' } });
    expect(res.status).toBe(200);
  });

  test('no Origin / Sec-Fetch-Site (curl, tests) passes; same-origin and none pass', async () => {
    expect((await call('POST')).status).toBe(200);
    expect((await call('POST', { 'sec-fetch-site': 'same-origin' })).status).toBe(200);
    expect((await call('POST', { 'sec-fetch-site': 'none' })).status).toBe(200);
  });

  test('GET is never blocked (OAuth callback, reads)', async () => {
    expect((await call('GET', { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' })).status).toBe(200);
  });

  test('origin listed in CORS_ORIGIN passes', async () => {
    process.env.CORS_ORIGIN = 'https://a.example, https://b.example';
    expect((await call('POST', { origin: 'https://b.example' })).status).toBe(200);
    expect((await call('POST', { origin: 'https://c.example' })).status).toBe(403);
  });

  test('server/index.js mounts it before the /api routers', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
    const guard = src.indexOf("app.use('/api', originGuard)");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(src.indexOf("app.use('/api/auth'"));
  });
});
