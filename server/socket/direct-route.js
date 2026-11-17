'use strict';

/**
 * direct-route.js — socket-direct path for clients whose ISP drops packets on the way to
 * Cloudflare (#415). Off unless DIRECT_SOCKET_URL is set; with it unset nothing here is installed.
 *
 * Shape: pages + REST stay behind Cloudflare. A Caddy on the VPS (DNS-only host, e.g.
 * direct.play3cr.win) proxies ONLY /socket.io/ to a second loopback listener (DIRECT_SOCKET_PORT,
 * default 3001) that feeds the same http.Server. cloudflared keeps using HTTP_PORT.
 *
 *  - Trust boundary = the listener port, not a header. On the direct port every client-supplied
 *    `cf-*` header is deleted before anything reads it (Caddy is reached by the public; it cannot
 *    vouch for CF headers), so the IP falls back to Caddy's X-Forwarded-For via loopback.
 *  - Credentials, two stages, so JS never holds a replayable credential:
 *    1. HTML through Cloudflare (CF-IPCountry trustworthy there) → JS-readable `gvn_sock` cookie
 *       with a NONCE: encrypted {session, country}, 60 s, single use.
 *    2. First direct handshake presents it in the query → consumed → the response sets `gvn_dt`,
 *       an HttpOnly cookie on the direct host only (Path=/socket.io/), sliding DIRECT_TTL.
 *       Later handshakes (reconnects, other pages, other tabs) use that cookie.
 *    Every handshake re-checks the live session row, so logout/kick/lock still end it. The session
 *    cookie itself stays host-only on play3cr.win (a Domain= cookie would reach dev.play3cr.win).
 *  - Who goes direct: CF-IPCountry ∈ DIRECT_SOCKET_COUNTRIES (default VN), logged-in session.
 */

const crypto = require('crypto');
const net = require('net');
const config = require('../config');
const logger = require('../utils/logger');
const { readSessionIdFromHeader, parseCookies } = require('../utils/session-cookie');
const { geoFromHeaders } = require('../utils/geo');

const ROUTE_COOKIE = 'gvn_sock';   // play3cr.win, JS-readable, {u: url, n: nonce}
const DIRECT_COOKIE = 'gvn_dt';    // direct host, HttpOnly, long ticket
const TICKET_VERSION = 2;
const NONCE_TTL_MS = 60 * 1000;
const KIND_NONCE = 'n';
const KIND_DIRECT = 'd';

function readConfig(env = process.env) {
  const url = String(env.DIRECT_SOCKET_URL || '').trim().replace(/\/+$/, '');
  return {
    enabled: !!url,
    url,
    port: parseInt(env.DIRECT_SOCKET_PORT, 10) || 3001,
    countries: new Set(String(env.DIRECT_SOCKET_COUNTRIES || 'VN').split(',')
      .map((c) => c.trim().toUpperCase()).filter(Boolean)),
    ttlMs: parseInt(env.DIRECT_SOCKET_TICKET_TTL_MS, 10) || 24 * 60 * 60 * 1000,
    // 'caddy' (default): IP from X-Forwarded-For set by a Caddy on this box.
    // 'cloudfront' (#415 C1): CloudFront → Cloudflare tunnel → this port; IP from CloudFront-Viewer-Address,
    // trusted only with the secret origin header (anyone can reach the tunnel hostname through Cloudflare).
    edge: String(env.DIRECT_SOCKET_EDGE || 'caddy').trim().toLowerCase(),
    edgeSecret: String(env.DIRECT_EDGE_SECRET || ''),
  };
}

// ── Tokens: AES-256-GCM over {k: kind, s: sessionId, c: country, e: expiry, j: id} ─────────────
// Encrypted, not just signed: the nonce sits in a JS-readable cookie and a URL query.
let _key = null;
function key() {
  if (!_key) _key = Buffer.from(crypto.hkdfSync('sha256', config.JWT_SECRET, '', 'gvn-socket-ticket-v2', 32));
  return _key;
}

function seal(kind, sessionId, country, ttlMs, now = Date.now()) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const payload = { v: TICKET_VERSION, k: kind, s: sessionId, c: country || null, e: now + ttlMs, j: crypto.randomBytes(9).toString('base64url') };
  const body = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

/** @returns {{kind, sessionId, country, exp, id}|null} null = forged, corrupt, expired or wrong kind */
function open(token, kind, now = Date.now()) {
  if (typeof token !== 'string' || token.length < 40 || token.length > 512) return null;
  try {
    const raw = Buffer.from(token, 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const p = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
    if (p.v !== TICKET_VERSION || p.k !== kind || typeof p.s !== 'string' || !(p.e > now)) return null;
    return { kind: p.k, sessionId: p.s, country: p.c || null, exp: p.e, id: p.j };
  } catch {
    return null;
  }
}

const issueNonce = (sessionId, country, now) => seal(KIND_NONCE, sessionId, country, NONCE_TTL_MS, now);
const issueDirectTicket = (sessionId, country, ttlMs, now) => seal(KIND_DIRECT, sessionId, country, ttlMs, now);

/** Single use: id → expiry. Lost on restart, which the 60 s expiry bounds. */
const _usedNonces = new Map();
function consumeNonce(token, now = Date.now()) {
  const t = open(token, KIND_NONCE, now);
  if (!t || _usedNonces.has(t.id)) return null;
  _usedNonces.set(t.id, t.exp);
  if (_usedNonces.size > 1000) for (const [id, exp] of _usedNonces) if (exp <= now) _usedNonces.delete(id);
  return t;
}

// ── Listener discrimination ──────────────────────────────────────────────────
function isDirectRequest(req, port) {
  return !!(req && req.socket && req.socket.localPort === port);
}

/** `CloudFront-Viewer-Address` is `ip:port` (IPv6 unbracketed) → ip. */
function viewerIp(v) {
  const s = String(v || '').trim();
  const i = s.lastIndexOf(':');
  return i > 0 ? s.slice(0, i) : null;
}

function secretOk(given, secret) {
  if (!secret || typeof given !== 'string') return false;
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * Normalise the edge headers on the direct port so resolveClientIp() sees only what we vouch for:
 * cf-* always deleted; in 'cloudfront' mode X-Forwarded-For := the viewer IP when the secret matches,
 * else deleted (and the request gets no credential). @returns {boolean} edge trusted
 */
function normaliseEdgeHeaders(headers, cfg) {
  stripCfHeaders(headers);
  if (cfg.edge !== 'cloudfront') return true;
  const ok = secretOk(headers['x-gvn-edge'], cfg.edgeSecret);
  const ip = ok && viewerIp(headers['cloudfront-viewer-address']);
  delete headers['x-gvn-edge'];
  if (ok && ip) headers['x-forwarded-for'] = ip;
  else delete headers['x-forwarded-for'];
  return !!(ok && ip);
}

/** Delete every `cf-*` header: on the direct port none of them came from Cloudflare. */
function stripCfHeaders(headers) {
  for (const name of Object.keys(headers)) if (name.startsWith('cf-')) delete headers[name];
}

function queryParam(req, name) {
  try { return new URL(req.url, 'http://x').searchParams.get(name); } catch { return null; }
}

/**
 * engine.io middleware (polling handshake AND websocket upgrade, before socket.io auth). On the
 * direct port: strip cf-*, then resolve the credential of a NEW engine connection — the HttpOnly
 * direct cookie first, else a one-time nonce from `?gvn_n=` — onto `req.gvnDirect`.
 */
function engineMiddleware(cfg, sessionManager) {
  return (req, _res, next) => {
    if (!isDirectRequest(req, cfg.port)) return next();
    const edgeOk = normaliseEdgeHeaders(req.headers, cfg);
    if (!edgeOk) return next(); // no credential → AUTH_TICKET at the socket.io layer
    if (queryParam(req, 'sid')) return next(); // later request of an existing engine connection
    const cookie = parseCookies(req.headers.cookie)[DIRECT_COOKIE];
    let t = cookie && open(cookie, KIND_DIRECT);
    if (!(t && sessionManager.getValidSession(t.sessionId))) t = consumeNonce(queryParam(req, 'gvn_n'));
    if (t && sessionManager.getValidSession(t.sessionId)) req.gvnDirect = { sessionId: t.sessionId, country: t.country };
    next();
  };
}

/** `initial_headers`: (re)issue the HttpOnly direct cookie on the handshake response — sliding expiry. */
function directCookieHeaders(cfg) {
  const secure = cfg.url.startsWith('https:') ? '; Secure' : '';
  return (headers, req) => {
    if (!req.gvnDirect || !isDirectRequest(req, cfg.port)) return;
    const value = issueDirectTicket(req.gvnDirect.sessionId, req.gvnDirect.country, cfg.ttlMs);
    headers['set-cookie'] = `${DIRECT_COOKIE}=${value}; Path=/socket.io/; Max-Age=${Math.floor(cfg.ttlMs / 1000)}; HttpOnly; SameSite=Lax${secure}`;
  };
}

/** Express: the direct port serves nothing but socket.io (Caddy should already enforce this). */
function expressGuard(port) {
  return (req, res, next) => {
    if (!isDirectRequest(req, port)) return next();
    res.status(404).end();
  };
}

/**
 * Second loopback listener feeding the existing http.Server, so socket.io/engine.io stay single
 * instances (no second io.attach). Each accepted TCP socket keeps localPort === port.
 */
function startDirectListener(server, port, host = '127.0.0.1') {
  const l = net.createServer((conn) => server.emit('connection', conn));
  l.listen(port, host, () => logger.info(`[Direct] socket listener on ${host}:${port}`));
  return l;
}

/** CSP connect-src must allow the direct origin, or the browser blocks the socket (found in a real-browser pass). */
function withDirectConnectSrc(directives, cfg) {
  if (!cfg.enabled) return directives;
  const origin = new URL(cfg.url).origin;
  const ws = origin.replace(/^http/, 'ws');
  return { ...directives, connectSrc: [...directives.connectSrc, origin, ws] };
}

// ── Route cookie on HTML responses ───────────────────────────────────────────
function isDocumentRequest(req) {
  if (req.method !== 'GET') return false;
  const dest = req.headers['sec-fetch-dest'];
  if (dest) return dest === 'document';
  return String(req.headers.accept || '').includes('text/html');
}

/**
 * On page navigations that came through Cloudflare: eligible → set `gvn_sock` = {u: url, n: nonce};
 * not eligible but holding one → clear it. Client reads it in socket-client.js before io().
 */
function routeCookieMiddleware(cfg, sessionManager) {
  return (req, res, next) => {
    if (!isDocumentRequest(req) || isDirectRequest(req, cfg.port)) return next();
    const { country } = geoFromHeaders(req.headers);
    const sid = readSessionIdFromHeader(req.headers.cookie);
    const session = sid && country && cfg.countries.has(country) ? sessionManager.getValidSession(sid) : null;
    const base = { httpOnly: false, sameSite: 'strict', secure: !!req.secure, path: '/' };
    if (session) {
      const value = JSON.stringify({ u: cfg.url, n: issueNonce(session.sessionId, country) });
      res.cookie(ROUTE_COOKIE, value, { ...base, maxAge: NONCE_TTL_MS });
    } else if (String(req.headers.cookie || '').includes(`${ROUTE_COOKIE}=`)) {
      res.clearCookie(ROUTE_COOKIE, base);
    }
    next();
  };
}

module.exports = {
  ROUTE_COOKIE,
  DIRECT_COOKIE,
  NONCE_TTL_MS,
  readConfig,
  issueNonce,
  issueDirectTicket,
  consumeNonce,
  open,
  KIND_NONCE,
  KIND_DIRECT,
  isDirectRequest,
  stripCfHeaders,
  normaliseEdgeHeaders,
  viewerIp,
  engineMiddleware,
  directCookieHeaders,
  expressGuard,
  startDirectListener,
  withDirectConnectSrc,
  routeCookieMiddleware,
};
