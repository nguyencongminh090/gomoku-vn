'use strict';

/**
 * get-client-ip.js — shared "real client IP behind the Cloudflare Tunnel"
 * resolution, usable from both Socket.io (server/socket/state.js) and plain
 * Express requests.
 *
 * Extracted from server/socket/state.js's getClientIp(socket) (TODO.md #44 /
 * instruction.md §44 — 6 rounds to find that socket.handshake.address is
 * always 127.0.0.1 behind this deployment's Cloudflare Tunnel). That fix only
 * ever covered Socket.io; every `express-rate-limit` instance in
 * server/routes/*.js (auth.js's authLimiter, games.js's gamesLimiter,
 * tournamentGames.js's tournamentGamesLimiter) still keys on Express's
 * default `req.ip`, which has the identical failure mode — see
 * docs/fix-log for the incident this file fixes.
 */

/** Loopback forms Node can report as the immediate TCP peer address. */
const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/**
 * Resolve the real client IP from a set of headers + the immediate TCP peer
 * address, accounting for a same-host proxy (cloudflared) connecting in over
 * loopback. This is the one piece of logic both Socket.io and Express need —
 * everything else (which object holds the headers, which field holds the
 * peer address) is specific to each caller and lives in the wrapper below /
 * in socket/state.js.
 *
 * CF-Connecting-IP takes priority when present: this deployment's zone is
 * proxied through Cloudflare, which sets that header itself at the edge to
 * the real client IP (overwriting, not appending — unlike X-Forwarded-For,
 * which a client could otherwise write multiple values into). When it's
 * absent (local dev without the tunnel, or a future non-Cloudflare
 * deployment), fall back to: only honor X-Forwarded-For when the immediate
 * peer is itself loopback, so a client that could reach the port directly
 * (bypassing the proxy) cannot spoof its own X-Forwarded-For.
 *
 * @param {Record<string, string|undefined>} headers lowercased header map
 * @param {string|undefined} remoteAddress the immediate TCP peer address
 * @returns {string|undefined}
 */
function resolveClientIp(headers, remoteAddress) {
  const cfConnectingIp = headers && headers['cf-connecting-ip'];
  if (cfConnectingIp) return cfConnectingIp;

  if (LOOPBACK_ADDRESSES.has(remoteAddress)) {
    const forwarded = headers && headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
  }
  return remoteAddress;
}

/**
 * Resolve the real client IP for a plain Express `req`.
 *
 * Deliberately reads `req.socket.remoteAddress` (the raw TCP peer), not
 * `req.ip` — `req.ip` is Express's own trust-proxy-aware resolution, which
 * folds X-Forwarded-For in before this function ever sees it, making it
 * impossible to tell "peer is loopback, honor XFF" from "peer is some
 * spoofable non-loopback address, ignore XFF". Using the raw peer address
 * here mirrors exactly what getClientIp(socket) does for
 * socket.handshake.address.
 *
 * @param {import('express').Request} req
 * @returns {string|undefined}
 */
function getClientIpFromReq(req) {
  const headers = req && req.headers;
  const remoteAddress = req && req.socket && req.socket.remoteAddress;
  return resolveClientIp(headers, remoteAddress);
}

module.exports = { resolveClientIp, getClientIpFromReq };
