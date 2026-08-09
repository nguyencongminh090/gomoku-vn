'use strict';

const { getClientIp } = require('../socket/state');
const { getClientIpFromReq } = require('../utils/get-client-ip');

function makeSocket(address, headers) {
  return { handshake: { address, headers: headers || {} } };
}

function makeReq(remoteAddress, headers) {
  return { headers: headers || {}, socket: { remoteAddress } };
}

describe('getClientIp()', () => {
  // --- CF-Connecting-IP present: always wins, regardless of peer/XFF ---

  test('uses CF-Connecting-IP when peer is loopback and no X-Forwarded-For', () => {
    const socket = makeSocket('127.0.0.1', { 'cf-connecting-ip': '203.0.113.9' });
    expect(getClientIp(socket)).toBe('203.0.113.9');
  });

  test('prefers CF-Connecting-IP over X-Forwarded-For even when they disagree', () => {
    const socket = makeSocket('127.0.0.1', {
      'cf-connecting-ip': '203.0.113.9',
      'x-forwarded-for': '198.51.100.5, 10.0.0.1',
    });
    expect(getClientIp(socket)).toBe('203.0.113.9');
  });

  test('uses CF-Connecting-IP even when peer is not loopback', () => {
    const socket = makeSocket('198.51.100.20', { 'cf-connecting-ip': '203.0.113.9' });
    expect(getClientIp(socket)).toBe('203.0.113.9');
  });

  // --- CF-Connecting-IP absent: falls back to prior X-Forwarded-For/loopback logic ---

  test('falls back to X-Forwarded-For when peer is loopback (IPv4) and no CF header', () => {
    const socket = makeSocket('127.0.0.1', { 'x-forwarded-for': '198.51.100.5, 10.0.0.1' });
    expect(getClientIp(socket)).toBe('198.51.100.5');
  });

  test('falls back to X-Forwarded-For when peer is loopback (IPv6 ::1) and no CF header', () => {
    const socket = makeSocket('::1', { 'x-forwarded-for': '198.51.100.5' });
    expect(getClientIp(socket)).toBe('198.51.100.5');
  });

  test('returns raw peer address when peer is loopback but no forwarding headers at all', () => {
    const socket = makeSocket('127.0.0.1', {});
    expect(getClientIp(socket)).toBe('127.0.0.1');
  });

  test('ignores X-Forwarded-For and returns peer address when peer is not loopback', () => {
    const socket = makeSocket('198.51.100.20', { 'x-forwarded-for': '203.0.113.9' });
    expect(getClientIp(socket)).toBe('198.51.100.20');
  });

  test('returns undefined when handshake has no address and no CF header', () => {
    const socket = { handshake: { headers: {} } };
    expect(getClientIp(socket)).toBeUndefined();
  });
});

// getClientIpFromReq() shares its core resolution with getClientIp() above
// (both delegate to utils/get-client-ip.js's resolveClientIp) — this suite
// exists to prove the Express-request wiring (req.headers + the RAW
// req.socket.remoteAddress, deliberately not the trust-proxy-resolved
// req.ip) is correct, not to re-exhaust every case already covered above.
describe('getClientIpFromReq() — express-rate-limit keyGenerator (TODO.md #92)', () => {
  test('uses CF-Connecting-IP when peer is loopback', () => {
    const req = makeReq('127.0.0.1', { 'cf-connecting-ip': '203.0.113.9' });
    expect(getClientIpFromReq(req)).toBe('203.0.113.9');
  });

  test('falls back to X-Forwarded-For when peer is loopback and no CF header — the tunnel case', () => {
    // This is the exact shape a request through this deployment's Cloudflare
    // Tunnel takes when CF-Connecting-IP is somehow absent: cloudflared
    // connects to the Node process over loopback, so req.socket.remoteAddress
    // is 127.0.0.1 for every visitor regardless of their real IP.
    const req = makeReq('127.0.0.1', { 'x-forwarded-for': '198.51.100.5, 10.0.0.1' });
    expect(getClientIpFromReq(req)).toBe('198.51.100.5');
  });

  test('ignores X-Forwarded-For and returns the raw peer when peer is not loopback', () => {
    const req = makeReq('198.51.100.20', { 'x-forwarded-for': '203.0.113.9' });
    expect(getClientIpFromReq(req)).toBe('198.51.100.20');
  });

  test('two different real client IPs behind the same loopback peer resolve to two different keys', () => {
    // The actual bug this fixes: phone and laptop both arrive with peer
    // 127.0.0.1 (via the tunnel) — must NOT collapse to the same rate-limit key.
    const phone  = makeReq('127.0.0.1', { 'cf-connecting-ip': '203.0.113.9' });
    const laptop = makeReq('127.0.0.1', { 'cf-connecting-ip': '198.51.100.20' });
    expect(getClientIpFromReq(phone)).not.toBe(getClientIpFromReq(laptop));
  });

  test('returns undefined when there is no remoteAddress and no CF header', () => {
    const req = { headers: {}, socket: {} };
    expect(getClientIpFromReq(req)).toBeUndefined();
  });

  test('tolerates a missing req.socket entirely', () => {
    const req = { headers: { 'cf-connecting-ip': '203.0.113.9' } };
    expect(getClientIpFromReq(req)).toBe('203.0.113.9');
  });
});
