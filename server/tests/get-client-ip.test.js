'use strict';

const { getClientIp } = require('../socket/state');

function makeSocket(address, headers) {
  return { handshake: { address, headers: headers || {} } };
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
