'use strict';

/**
 * direct-route.test.js — #415 socket-direct path.
 *
 * Pinned:
 *  - The direct listener is reached through a public Caddy, so client `CF-*` headers must be ignored
 *    THERE (IP from Caddy's XFF, country from the server-issued token) while the Cloudflare
 *    listener keeps honouring them.
 *  - JS never holds a replayable credential: the page gets a 60 s single-use nonce; the first direct
 *    handshake swaps it for an HttpOnly cookie scoped to the direct host's /socket.io/.
 *  - The session cookie is not a credential on the direct port, and nonce/ticket are not on the CF port.
 */

jest.mock('../db/database', () => ({
  createSession: jest.fn(),
  getSessionById: jest.fn(),
  revokeSession: jest.fn(() => ({ changes: 1 })),
  revokeSessionsForUser: jest.fn(() => ({ changes: 0 })),
  touchSession: jest.fn(),
  deleteExpiredSessions: jest.fn(() => ({ changes: 0 })),
}));
jest.mock('../utils/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { io: ioClient } = require('socket.io-client');
const db = require('../db/database');
const sessionManager = require('../managers/SessionManager');
const direct = require('../socket/direct-route');
const { verifySocketToken } = require('../middleware/auth');
const { clientInfoFromSocket } = require('../utils/geo');

const SID = 'sess-direct-1';
let alive;
const liveRow = () => ({
  id: SID, user_id: 'u1', display_name: 'Alice', is_guest: 0,
  expires_at: new Date(Date.now() + 3600e3).toISOString(), revoked_at: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  alive = true;
  db.getSessionById.mockImplementation((id) => (id === SID && alive ? liveRow() : undefined));
});

describe('tokens', () => {
  test('nonce round-trips session + country and does not expose the session id', () => {
    const n = direct.issueNonce(SID, 'VN');
    expect(Buffer.from(n, 'base64url').toString('latin1')).not.toContain(SID);
    expect(direct.consumeNonce(n)).toMatchObject({ sessionId: SID, country: 'VN' });
  });
  test('nonce is single use', () => {
    const n = direct.issueNonce(SID, 'VN');
    expect(direct.consumeNonce(n)).not.toBeNull();
    expect(direct.consumeNonce(n)).toBeNull();
  });
  test('nonce expires after 60 s', () => {
    const n = direct.issueNonce(SID, 'VN', Date.now() - direct.NONCE_TTL_MS - 1);
    expect(direct.consumeNonce(n)).toBeNull();
  });
  test('kinds do not cross: a direct ticket is not a nonce and vice versa', () => {
    expect(direct.consumeNonce(direct.issueDirectTicket(SID, 'VN', 60e3))).toBeNull();
    expect(direct.open(direct.issueNonce(SID, 'VN'), direct.KIND_DIRECT)).toBeNull();
  });
  test.each([
    ['tampered', () => { const t = direct.issueNonce(SID, 'VN'); return t.slice(0, 30) + (t[30] === 'A' ? 'B' : 'A') + t.slice(31); }],
    ['garbage', () => 'x'.repeat(60)],
    ['too short', () => 'abc'],
    ['not a string', () => ({ s: SID })],
  ])('rejects %s', (_n, make) => {
    expect(direct.consumeNonce(make())).toBeNull();
  });
});

describe('routeCookieMiddleware', () => {
  const cfg = direct.readConfig({ DIRECT_SOCKET_URL: 'https://direct.example/', DIRECT_SOCKET_PORT: '3999' });
  const mw = direct.routeCookieMiddleware(cfg, sessionManager);
  function run(headers, { method = 'GET', localPort = 3000 } = {}) {
    const res = { cookie: jest.fn(), clearCookie: jest.fn() };
    const next = jest.fn();
    mw({ method, headers, socket: { localPort }, secure: true }, res, next);
    expect(next).toHaveBeenCalled();
    return res;
  }
  const doc = { 'sec-fetch-dest': 'document', cookie: `gvn_session=${SID}`, 'cf-ipcountry': 'VN' };

  test('VN + live session + page navigation → short-lived nonce cookie with url', () => {
    const res = run(doc);
    expect(res.cookie).toHaveBeenCalledTimes(1);
    const [name, value, opts] = res.cookie.mock.calls[0];
    expect(name).toBe('gvn_sock');
    const v = JSON.parse(value);
    expect(v.u).toBe('https://direct.example');
    expect(direct.consumeNonce(v.n)).toMatchObject({ sessionId: SID, country: 'VN' });
    expect(opts).toMatchObject({ httpOnly: false, sameSite: 'strict', secure: true, path: '/', maxAge: direct.NONCE_TTL_MS });
    expect(opts.domain).toBeUndefined(); // host-only: never reaches dev.<domain>
  });
  test.each([
    ['other country', { ...doc, 'cf-ipcountry': 'JP' }],
    ['no country (not via CF)', { ...doc, 'cf-ipcountry': undefined }],
    ['no session', { ...doc, cookie: '' }],
    ['dead session', { ...doc, cookie: 'gvn_session=nope' }],
    ['not a document', { ...doc, 'sec-fetch-dest': 'script' }],
  ])('%s → no nonce', (_n, headers) => {
    expect(run(headers).cookie).not.toHaveBeenCalled();
  });
  test('ineligible but holding an old one → cleared', () => {
    const res = run({ ...doc, 'cf-ipcountry': 'JP', cookie: `gvn_session=${SID}; gvn_sock=x` });
    expect(res.clearCookie).toHaveBeenCalledWith('gvn_sock', expect.objectContaining({ path: '/' }));
  });
  test('POST and direct-port requests are skipped', () => {
    expect(run(doc, { method: 'POST' }).cookie).not.toHaveBeenCalled();
    expect(run(doc, { localPort: 3999 }).cookie).not.toHaveBeenCalled();
  });
});

describe('two listeners, one server (integration)', () => {
  let server, io, directListener, mainPort, directPort, seen, issued;
  const ORIGINAL = { ...process.env };

  beforeAll(async () => {
    const app = express();
    server = http.createServer(app);
    directListener = direct.startDirectListener(server, 0);
    await new Promise((r) => directListener.once('listening', r));
    directPort = directListener.address().port;
    Object.assign(process.env, { DIRECT_SOCKET_URL: 'http://direct.test', DIRECT_SOCKET_PORT: String(directPort) });
    delete process.env.CORS_ORIGIN;
    process.env.NODE_ENV = 'test';
    const cfg = direct.readConfig();
    app.use(direct.expressGuard(directPort));
    app.get('/', (_req, res) => res.send('page'));
    io = new Server(server);
    io.engine.use(direct.engineMiddleware(cfg, sessionManager));
    io.engine.on('initial_headers', direct.directCookieHeaders(cfg));
    // registered after → sees what the real hook wrote into the handshake response headers
    io.engine.on('initial_headers', (h) => { if (h['set-cookie']) issued.push(h['set-cookie']); });
    io.use(verifySocketToken);
    io.on('connection', (s) => seen.push({ info: clientInfoFromSocket(s), route: s.data.route, user: s.user.userId }));
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    mainPort = server.address().port;
  });
  afterAll(async () => {
    process.env = ORIGINAL;
    io.close();
    directListener.close();
  });
  beforeEach(() => { seen = []; issued = []; });

  /** Connect once; resolve with the outcome and the Set-Cookie (if any) of its handshake response. */
  function connect(port, { query = {}, headers = {} } = {}) {
    return new Promise((resolve) => {
      const before = issued.length;
      const setCookie = () => (issued.length > before ? issued[issued.length - 1] : null);
      const s = ioClient(`http://127.0.0.1:${port}`, { query, extraHeaders: headers, transports: ['websocket'], reconnection: false, forceNew: true });
      s.on('connect', () => { s.close(); setTimeout(() => resolve({ ok: true, setCookie: setCookie() }), 20); });
      s.on('connect_error', (e) => { s.close(); resolve({ ok: false, code: e.message, setCookie: setCookie() }); });
    });
  }
  const cookieValue = (sc) => String(sc).match(/gvn_dt=([^;]+)/)[1];
  const FORGED = { 'cf-connecting-ip': '6.6.6.6', 'cf-ipcountry': 'US', 'x-forwarded-for': '203.0.113.7' };

  test('direct + nonce: forged CF headers ignored, IP from XFF, country from token, HttpOnly cookie issued', async () => {
    const r = await connect(directPort, { query: { gvn_n: direct.issueNonce(SID, 'VN') }, headers: FORGED });
    expect(r.ok).toBe(true);
    expect(seen[0]).toMatchObject({ route: 'direct', user: 'u1' });
    expect(seen[0].info.ip).toBe('203.0.113.7');
    expect(seen[0].info.geoRaw.country).toBe('VN');
    expect(String(r.setCookie)).toMatch(/^gvn_dt=[^;]+; Path=\/socket\.io\/; Max-Age=\d+; HttpOnly; SameSite=Lax/);
  });
  test('the nonce works once; the issued cookie carries every later handshake', async () => {
    const nonce = direct.issueNonce(SID, 'VN');
    const first = await connect(directPort, { query: { gvn_n: nonce } });
    expect(first.ok).toBe(true);
    expect(await connect(directPort, { query: { gvn_n: nonce } })).toMatchObject({ ok: false, code: 'AUTH_TICKET' });
    const again = await connect(directPort, { query: { gvn_n: nonce }, headers: { cookie: `gvn_dt=${cookieValue(first.setCookie)}` } });
    expect(again.ok).toBe(true);
    expect(again.setCookie).not.toBeNull(); // sliding re-issue
  });
  test('logout/kick ends the direct cookie too (session row re-checked)', async () => {
    const first = await connect(directPort, { query: { gvn_n: direct.issueNonce(SID, 'VN') } });
    alive = false;
    expect(await connect(directPort, { headers: { cookie: `gvn_dt=${cookieValue(first.setCookie)}` } }))
      .toMatchObject({ ok: false, code: 'AUTH_TICKET' });
  });
  test.each([
    ['nothing', {}, {}],
    ['bad nonce', { gvn_n: 'x'.repeat(60) }, {}],
    ['session cookie only', {}, { cookie: `gvn_session=${SID}` }],
    ['a direct ticket passed as nonce', { gvn_n: direct.issueDirectTicket(SID, 'VN', 60e3) }, {}],
    ['a nonce passed as direct cookie', {}, { cookie: `gvn_dt=${direct.issueNonce(SID, 'VN')}` }],
    ['nonce for a dead session', { gvn_n: direct.issueNonce('gone', 'VN') }, {}],
  ])('direct + %s → AUTH_TICKET, no cookie', async (_n, query, headers) => {
    const r = await connect(directPort, { query, headers });
    expect(r).toMatchObject({ ok: false, code: 'AUTH_TICKET' });
    expect(r.setCookie).toBeNull();
  });
  test('Cloudflare listener unchanged: CF headers honoured, nonce/direct cookie are not credentials', async () => {
    expect(await connect(mainPort, { query: { gvn_n: direct.issueNonce(SID, 'VN') } })).toMatchObject({ ok: false, code: 'AUTH_REQUIRED' });
    const viaDirectCookie = await connect(mainPort, { headers: { cookie: `gvn_dt=${direct.issueDirectTicket(SID, 'VN', 60e3)}` } });
    expect(viaDirectCookie).toMatchObject({ ok: false, code: 'AUTH_REQUIRED', setCookie: null });
    const r = await connect(mainPort, { headers: { ...FORGED, cookie: `gvn_session=${SID}` } });
    expect(r.ok).toBe(true);
    expect(r.setCookie).toBeNull();
    expect(seen[0].route).toBeUndefined();
    expect(seen[0].info.ip).toBe('6.6.6.6');
  });
  test('direct listener serves no pages', async () => {
    const get = (port) => new Promise((r) => http.get(`http://127.0.0.1:${port}/`, (res) => { res.resume(); r(res.statusCode); }));
    expect(await get(directPort)).toBe(404);
    expect(await get(mainPort)).toBe(200);
  });
});

describe('withDirectConnectSrc (CSP)', () => {
  const base = { connectSrc: ["'self'"], defaultSrc: ["'self'"] };
  test('off → directives untouched', () => {
    expect(direct.withDirectConnectSrc(base, direct.readConfig({}))).toBe(base);
  });
  test('on → https + wss origin of the direct host added', () => {
    const out = direct.withDirectConnectSrc(base, direct.readConfig({ DIRECT_SOCKET_URL: 'https://direct.example/' }));
    expect(out.connectSrc).toEqual(["'self'", 'https://direct.example', 'wss://direct.example']);
    expect(base.connectSrc).toEqual(["'self'"]);
  });
});

describe('cloudfront edge mode (#415 C1)', () => {
  const cfg = direct.readConfig({ DIRECT_SOCKET_URL: 'https://direct.example', DIRECT_SOCKET_EDGE: 'cloudfront', DIRECT_EDGE_SECRET: 's3cret-value' });
  const viaEdge = (over = {}) => ({
    'cf-connecting-ip': '54.239.1.1', 'cf-ipcountry': 'SG', // Cloudflare saw CloudFront, not the player
    'x-forwarded-for': '6.6.6.6, 54.239.1.1',
    'cloudfront-viewer-address': '113.161.2.3:51234', 'x-gvn-edge': 's3cret-value', ...over,
  });

  test.each([
    ['113.161.2.3:51234', '113.161.2.3'],
    ['2405:4802:1::5:443', '2405:4802:1::5'],
    ['', null],
    [undefined, null],
  ])('viewerIp(%p) → %p', (v, ip) => expect(direct.viewerIp(v)).toBe(ip));

  test('secret ok → XFF is exactly the viewer IP, cf-* and the secret removed', () => {
    const h = viaEdge();
    expect(direct.normaliseEdgeHeaders(h, cfg)).toBe(true);
    expect(h['x-forwarded-for']).toBe('113.161.2.3');
    expect(Object.keys(h).filter((k) => k.startsWith('cf-') || k === 'x-gvn-edge')).toEqual([]);
  });
  test.each([
    ['missing secret', { 'x-gvn-edge': undefined }],
    ['wrong secret', { 'x-gvn-edge': 's3cret-valuX' }],
    ['wrong length', { 'x-gvn-edge': 's3cret' }],
    ['no viewer address', { 'cloudfront-viewer-address': undefined }],
  ])('%s → not trusted, XFF dropped', (_n, over) => {
    const h = viaEdge(over);
    expect(direct.normaliseEdgeHeaders(h, cfg)).toBe(false);
    expect(h['x-forwarded-for']).toBeUndefined();
  });
  test('cloudfront mode without a configured secret never trusts', () => {
    const noSecret = direct.readConfig({ DIRECT_SOCKET_URL: 'https://d', DIRECT_SOCKET_EDGE: 'cloudfront' });
    expect(direct.normaliseEdgeHeaders(viaEdge({ 'x-gvn-edge': '' }), noSecret)).toBe(false);
  });
  test('engine middleware: untrusted edge gets no credential even with a valid nonce', () => {
    const mw = direct.engineMiddleware({ ...cfg, port: 4999 }, sessionManager);
    const req = { url: `/socket.io/?EIO=4&gvn_n=${direct.issueNonce(SID, 'VN')}`, socket: { localPort: 4999 }, headers: viaEdge({ 'x-gvn-edge': 'nope' }) };
    mw(req, {}, () => {});
    expect(req.gvnDirect).toBeUndefined();
    const ok = { url: `/socket.io/?EIO=4&gvn_n=${direct.issueNonce(SID, 'VN')}`, socket: { localPort: 4999 }, headers: viaEdge() };
    mw(ok, {}, () => {});
    expect(ok.gvnDirect).toEqual({ sessionId: SID, country: 'VN' });
  });
  test('caddy mode (default) unchanged: XFF kept for resolveClientIp', () => {
    const h = { 'x-forwarded-for': '203.0.113.7', 'cf-connecting-ip': '6.6.6.6' };
    expect(direct.normaliseEdgeHeaders(h, direct.readConfig({ DIRECT_SOCKET_URL: 'https://d' }))).toBe(true);
    expect(h).toEqual({ 'x-forwarded-for': '203.0.113.7' });
  });
});
