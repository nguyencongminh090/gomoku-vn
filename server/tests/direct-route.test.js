'use strict';

/**
 * direct-route.test.js — #415 socket-direct path.
 *
 * The risk that matters: the direct listener is reached through a public Caddy, so a client can
 * send any `CF-*` header. Those must be ignored THERE (IP from Caddy's X-Forwarded-For, country
 * from the server-issued ticket) while the Cloudflare listener keeps honouring them. Also pinned:
 * the ticket is the only credential on the direct port, and it can't be forged / replayed late.
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
const liveRow = () => ({
  id: SID, user_id: 'u1', display_name: 'Alice', is_guest: 0,
  expires_at: new Date(Date.now() + 3600e3).toISOString(), revoked_at: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  db.getSessionById.mockImplementation((id) => (id === SID ? liveRow() : undefined));
});

describe('ticket', () => {
  test('round-trips session id + country', () => {
    expect(direct.readTicket(direct.issueTicket(SID, 'VN', 60e3))).toEqual({ sessionId: SID, country: 'VN' });
  });
  test('does not expose the session id in clear', () => {
    const t = direct.issueTicket(SID, 'VN', 60e3);
    expect(Buffer.from(t, 'base64url').toString('latin1')).not.toContain(SID);
  });
  test.each([
    ['expired', () => direct.issueTicket(SID, 'VN', 1000, Date.now() - 2000)],
    ['tampered', () => { const t = direct.issueTicket(SID, 'VN', 60e3); return t.slice(0, 30) + (t[30] === 'A' ? 'B' : 'A') + t.slice(31); }],
    ['garbage', () => 'x'.repeat(60)],
    ['too short', () => 'abc'],
    ['not a string', () => ({ s: SID })],
  ])('rejects %s', (_n, make) => {
    expect(direct.readTicket(make())).toBeNull();
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

  test('VN + live session + page navigation → ticket cookie with url', () => {
    const res = run(doc);
    expect(res.cookie).toHaveBeenCalledTimes(1);
    const [name, value, opts] = res.cookie.mock.calls[0];
    expect(name).toBe('gvn_sock');
    const v = JSON.parse(value);
    expect(v.u).toBe('https://direct.example');
    expect(direct.readTicket(v.t)).toEqual({ sessionId: SID, country: 'VN' });
    expect(opts).toMatchObject({ httpOnly: false, sameSite: 'strict', secure: true, path: '/' });
    expect(opts.domain).toBeUndefined(); // host-only: never reaches dev.<domain>
  });
  test.each([
    ['other country', { ...doc, 'cf-ipcountry': 'JP' }],
    ['no country (not via CF)', { ...doc, 'cf-ipcountry': undefined }],
    ['no session', { ...doc, cookie: '' }],
    ['dead session', { ...doc, cookie: 'gvn_session=nope' }],
    ['not a document', { ...doc, 'sec-fetch-dest': 'script' }],
  ])('%s → no ticket', (_n, headers) => {
    expect(run(headers).cookie).not.toHaveBeenCalled();
  });
  test('ineligible but holding an old ticket → cleared', () => {
    const res = run({ ...doc, 'cf-ipcountry': 'JP', cookie: `gvn_session=${SID}; gvn_sock=x` });
    expect(res.clearCookie).toHaveBeenCalledWith('gvn_sock', expect.objectContaining({ path: '/' }));
  });
  test('POST and direct-port requests are skipped', () => {
    expect(run(doc, { method: 'POST' }).cookie).not.toHaveBeenCalled();
    expect(run(doc, { localPort: 3999 }).cookie).not.toHaveBeenCalled();
  });
});

describe('two listeners, one server (integration)', () => {
  let server, io, directListener, mainPort, directPort, seen;
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
    app.use(direct.expressGuard(directPort));
    app.get('/', (_req, res) => res.send('page'));
    io = new Server(server);
    io.engine.use(direct.engineMiddleware(directPort));
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
  beforeEach(() => { seen = []; });

  function connect(port, { auth = {}, headers = {} } = {}) {
    return new Promise((resolve) => {
      const s = ioClient(`http://127.0.0.1:${port}`, { auth, extraHeaders: headers, transports: ['websocket'], reconnection: false, forceNew: true });
      s.on('connect', () => { s.close(); setTimeout(() => resolve({ ok: true }), 20); });
      s.on('connect_error', (e) => { s.close(); resolve({ ok: false, code: e.message }); });
    });
  }
  const FORGED = { 'cf-connecting-ip': '6.6.6.6', 'cf-ipcountry': 'US', 'x-forwarded-for': '203.0.113.7' };

  test('direct + ticket: forged CF headers ignored, IP from XFF, country from ticket', async () => {
    const r = await connect(directPort, { auth: { ticket: direct.issueTicket(SID, 'VN', 60e3) }, headers: FORGED });
    expect(r.ok).toBe(true);
    expect(seen[0]).toMatchObject({ route: 'direct', user: 'u1' });
    expect(seen[0].info.ip).toBe('203.0.113.7');
    expect(seen[0].info.geoRaw.country).toBe('VN');
  });
  test.each([
    ['no ticket', {}, {}],
    ['bad ticket', { ticket: 'x'.repeat(60) }, {}],
    ['cookie only', {}, { cookie: `gvn_session=${SID}` }],
    ['ticket for a dead session', { ticket: direct.issueTicket('gone', 'VN', 60e3) }, {}],
  ])('direct + %s → AUTH_TICKET', async (_n, auth, headers) => {
    expect(await connect(directPort, { auth, headers })).toEqual({ ok: false, code: 'AUTH_TICKET' });
  });
  test('Cloudflare listener unchanged: CF headers honoured, ticket alone is not a credential', async () => {
    expect(await connect(mainPort, { auth: { ticket: direct.issueTicket(SID, 'VN', 60e3) } })).toEqual({ ok: false, code: 'AUTH_REQUIRED' });
    const r = await connect(mainPort, { headers: { ...FORGED, cookie: `gvn_session=${SID}` } });
    expect(r.ok).toBe(true);
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
