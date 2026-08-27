'use strict';

/**
 * geo.js — attach a coarse geo label to the resolved client IP for logging.
 *
 * Source of truth is Cloudflare's edge headers, not a bundled GeoIP database:
 * this deployment's zone is proxied through Cloudflare (see
 * ../utils/get-client-ip.js — the same reason CF-Connecting-IP is trusted for
 * the real IP), and Cloudflare adds `CF-IPCountry` to every proxied request
 * for free, with `CF-IPCity` / `CF-Region` / `CF-ASN` available once the
 * "Add visitor location headers" Managed Transform is enabled on the zone.
 * No dependency, no local DB to keep updated, no per-request lookup.
 *
 * Trade-off: requests that don't come through Cloudflare (local dev, direct
 * curl, a future non-CF deployment) get no country — they log `geo=-`
 * (or `geo=local` for loopback/RFC-1918). Swapping in an offline DB
 * (`geoip-lite` / MaxMind) later only means changing `geoFromHeaders` +
 * `formatGeo` here; every call site already goes through this module.
 */

const { resolveClientIp, getClientIpFromReq } = require('./get-client-ip');

// Loopback + link-local + RFC-1918 / unique-local ranges. Anything matching
// is "not routable on the internet" → label `local`, never `-`.
const PRIVATE_RE =
  /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|::1$|fe80:|f[cd][0-9a-f]{2}:)/i;

function isPrivateIp(ip) {
  if (!ip) return false;
  const s = String(ip).replace(/^::ffff:/i, '');
  return s === '::1' || PRIVATE_RE.test(s);
}

/**
 * Pull whatever geo Cloudflare attached to this request's headers.
 * `CF-IPCountry` values `XX` (unknown) and `T1` (Tor) are normalized away.
 *
 * @param {Record<string,string|undefined>} headers lowercased header map
 * @returns {{country: string|null, city: string|null, region: string|null, asn: string|null}}
 */
function geoFromHeaders(headers) {
  const h = headers || {};
  let country = h['cf-ipcountry'] || null;
  if (country) {
    country = country.toUpperCase();
    if (country === 'XX' || country === 'T1' || country === '') country = null;
  }
  return {
    country,
    city: h['cf-ipcity'] || null,
    region: h['cf-region-code'] || h['cf-region'] || null,
    asn: h['cf-asn'] || null,
  };
}

/**
 * Compact single-token label for a log line: `local`, `-`, `VN`, or
 * `VN/Hanoi`. `ip` is passed so a private address wins over a stale/absent
 * country header.
 */
function formatGeo(geo, ip) {
  if (isPrivateIp(ip)) return 'local';
  if (!geo || !geo.country) return '-';
  if (geo.city) return `${geo.country}/${geo.city}`;
  if (geo.region) return `${geo.country}/${geo.region}`;
  return geo.country;
}

/** `{ ip, geo, geoRaw }` for a plain Express request. */
function clientInfoFromReq(req) {
  const ip = getClientIpFromReq(req);
  const geoRaw = geoFromHeaders(req && req.headers);
  return { ip: ip || '-', geo: formatGeo(geoRaw, ip), geoRaw };
}

/** `{ ip, geo, geoRaw }` for a Socket.io socket (uses the handshake). */
function clientInfoFromSocket(socket) {
  const hs = (socket && socket.handshake) || {};
  const ip = resolveClientIp(hs.headers, hs.address);
  const geoRaw = geoFromHeaders(hs.headers);
  return { ip: ip || '-', geo: formatGeo(geoRaw, ip), geoRaw };
}

module.exports = {
  isPrivateIp,
  geoFromHeaders,
  formatGeo,
  clientInfoFromReq,
  clientInfoFromSocket,
};
