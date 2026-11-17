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
 *  - Auth = a short-lived encrypted ticket, not the session cookie. The cookie stays host-only on
 *    play3cr.win (a Domain= cookie would also reach dev.play3cr.win). The ticket is handed out on
 *    HTML responses that came through Cloudflare (so CF-IPCountry is trustworthy there), carries
 *    the session id encrypted + the country, and is re-checked against the live session row on
 *    every handshake, so revocation still works.
 *  - Who goes direct: CF-IPCountry ∈ DIRECT_SOCKET_COUNTRIES (default VN), logged-in session.
 */

const crypto = require('crypto');
const net = require('net');
const config = require('../config');
const logger = require('../utils/logger');
const { readSessionIdFromHeader } = require('../utils/session-cookie');
const { geoFromHeaders } = require('../utils/geo');

const ROUTE_COOKIE = 'gvn_sock';
const TICKET_VERSION = 1;

function readConfig(env = process.env) {
  const url = String(env.DIRECT_SOCKET_URL || '').trim().replace(/\/+$/, '');
  return {
    enabled: !!url,
    url,
    port: parseInt(env.DIRECT_SOCKET_PORT, 10) || 3001,
    countries: new Set(String(env.DIRECT_SOCKET_COUNTRIES || 'VN').split(',')
      .map((c) => c.trim().toUpperCase()).filter(Boolean)),
    ttlMs: parseInt(env.DIRECT_SOCKET_TICKET_TTL_MS, 10) || 30 * 60 * 1000,
  };
}

// ── Ticket: AES-256-GCM over {s: sessionId, c: country, e: expiry} ───────────
// Encrypted (not just signed) because the cookie is JS-readable and must not expose the session id.
let _key = null;
function key() {
  if (!_key) _key = Buffer.from(crypto.hkdfSync('sha256', config.JWT_SECRET, '', 'gvn-socket-ticket-v1', 32));
  return _key;
}

function issueTicket(sessionId, country, ttlMs, now = Date.now()) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify({ v: TICKET_VERSION, s: sessionId, c: country || null, e: now + ttlMs })), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

/** @returns {{sessionId: string, country: string|null}|null} null = forged, corrupt or expired */
function readTicket(ticket, now = Date.now()) {
  if (typeof ticket !== 'string' || ticket.length < 40 || ticket.length > 512) return null;
  try {
    const raw = Buffer.from(ticket, 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    const p = JSON.parse(Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8'));
    if (p.v !== TICKET_VERSION || typeof p.s !== 'string' || !(p.e > now)) return null;
    return { sessionId: p.s, country: p.c || null };
  } catch {
    return null;
  }
}

// ── Listener discrimination ──────────────────────────────────────────────────
function isDirectRequest(req, port) {
  return !!(req && req.socket && req.socket.localPort === port);
}

/** Delete every `cf-*` header: on the direct port none of them came from Cloudflare. */
function stripCfHeaders(headers) {
  for (const name of Object.keys(headers)) if (name.startsWith('cf-')) delete headers[name];
}

/** engine.io middleware: runs on the polling handshake AND the websocket upgrade, before socket.io auth. */
function engineMiddleware(port) {
  return (req, _res, next) => {
    if (isDirectRequest(req, port)) stripCfHeaders(req.headers);
    next();
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
 * On page navigations that came through Cloudflare: eligible → set `gvn_sock` = {u: url, t: ticket};
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
      const value = JSON.stringify({ u: cfg.url, t: issueTicket(session.sessionId, country, cfg.ttlMs) });
      res.cookie(ROUTE_COOKIE, value, { ...base, maxAge: cfg.ttlMs });
    } else if (String(req.headers.cookie || '').includes(`${ROUTE_COOKIE}=`)) {
      res.clearCookie(ROUTE_COOKIE, base);
    }
    next();
  };
}

/**
 * Keep a connected direct socket's ticket fresh, so socket.io's reconnect loop (which re-sends
 * `auth`) still has a valid one after a long session. Emitted over the direct socket itself — no
 * extra request on the lossy CF leg.
 */
function attachTicketRefresh(io, cfg) {
  io.on('connection', (socket) => {
    if (!socket.data || socket.data.route !== 'direct') return;
    const send = () => socket.emit('route:ticket', issueTicket(socket.sessionId, socket.data.country, cfg.ttlMs));
    send();
    const t = setInterval(send, Math.max(60_000, Math.floor(cfg.ttlMs / 3)));
    if (t.unref) t.unref();
    socket.on('disconnect', () => clearInterval(t));
  });
}

module.exports = {
  ROUTE_COOKIE,
  readConfig,
  issueTicket,
  readTicket,
  isDirectRequest,
  stripCfHeaders,
  engineMiddleware,
  expressGuard,
  startDirectListener,
  withDirectConnectSrc,
  routeCookieMiddleware,
  attachTicketRefresh,
};
