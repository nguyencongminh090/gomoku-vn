'use strict';

const {
  isPrivateIp,
  geoFromHeaders,
  formatGeo,
  clientInfoFromReq,
  clientInfoFromSocket,
} = require('../utils/geo');

describe('isPrivateIp()', () => {
  test.each([
    ['127.0.0.1', true],
    ['::1', true],
    ['::ffff:127.0.0.1', true],
    ['10.1.2.3', true],
    ['192.168.0.5', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['169.254.10.10', true],
    ['fd00::1', true],
    ['172.32.0.1', false],   // just outside the 172.16/12 block
    ['203.0.113.9', false],
    ['8.8.8.8', false],
    ['', false],
    [undefined, false],
  ])('isPrivateIp(%p) === %p', (ip, expected) => {
    expect(isPrivateIp(ip)).toBe(expected);
  });
});

describe('geoFromHeaders()', () => {
  test('reads CF-IPCountry and normalizes case', () => {
    expect(geoFromHeaders({ 'cf-ipcountry': 'vn' })).toMatchObject({ country: 'VN' });
  });

  test('drops placeholder country values XX and T1', () => {
    expect(geoFromHeaders({ 'cf-ipcountry': 'XX' }).country).toBeNull();
    expect(geoFromHeaders({ 'cf-ipcountry': 'T1' }).country).toBeNull();
  });

  test('picks up optional city / region / asn when present', () => {
    expect(geoFromHeaders({
      'cf-ipcountry': 'US',
      'cf-ipcity': 'Ashburn',
      'cf-region-code': 'VA',
      'cf-asn': '13335',
    })).toEqual({ country: 'US', city: 'Ashburn', region: 'VA', asn: '13335' });
  });

  test('falls back to cf-region when cf-region-code is absent', () => {
    expect(geoFromHeaders({ 'cf-ipcountry': 'US', 'cf-region': 'Virginia' }).region).toBe('Virginia');
  });

  test('empty / missing headers → all null', () => {
    expect(geoFromHeaders({})).toEqual({ country: null, city: null, region: null, asn: null });
    expect(geoFromHeaders(undefined)).toEqual({ country: null, city: null, region: null, asn: null });
  });
});

describe('formatGeo()', () => {
  test('private IP always labels "local", even with a country header', () => {
    expect(formatGeo({ country: 'VN' }, '127.0.0.1')).toBe('local');
  });

  test('no country and public IP → "-"', () => {
    expect(formatGeo({ country: null }, '203.0.113.9')).toBe('-');
    expect(formatGeo(null, '203.0.113.9')).toBe('-');
  });

  test('country only', () => {
    expect(formatGeo({ country: 'VN' }, '203.0.113.9')).toBe('VN');
  });

  test('country + city preferred over region', () => {
    expect(formatGeo({ country: 'US', city: 'Ashburn', region: 'VA' }, '8.8.8.8')).toBe('US/Ashburn');
  });

  test('country + region when no city', () => {
    expect(formatGeo({ country: 'US', region: 'VA' }, '8.8.8.8')).toBe('US/VA');
  });
});

describe('clientInfoFromReq()', () => {
  test('real client behind the Cloudflare tunnel: CF-Connecting-IP + CF-IPCountry', () => {
    const req = {
      headers: { 'cf-connecting-ip': '203.0.113.9', 'cf-ipcountry': 'VN' },
      socket: { remoteAddress: '127.0.0.1' },
    };
    expect(clientInfoFromReq(req)).toMatchObject({ ip: '203.0.113.9', geo: 'VN' });
  });

  test('local dev (no CF headers) → ip is loopback, geo "local"', () => {
    const req = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
    expect(clientInfoFromReq(req)).toMatchObject({ ip: '127.0.0.1', geo: 'local' });
  });

  test('no resolvable ip → "-" placeholders, never throws', () => {
    expect(clientInfoFromReq({ headers: {}, socket: {} })).toMatchObject({ ip: '-', geo: '-' });
  });
});

describe('clientInfoFromSocket()', () => {
  test('resolves from the handshake headers + address', () => {
    const socket = {
      handshake: {
        address: '127.0.0.1',
        headers: { 'cf-connecting-ip': '198.51.100.20', 'cf-ipcountry': 'GB' },
      },
    };
    expect(clientInfoFromSocket(socket)).toMatchObject({ ip: '198.51.100.20', geo: 'GB' });
  });

  test('tolerates a socket with no handshake', () => {
    expect(clientInfoFromSocket({})).toMatchObject({ ip: '-', geo: '-' });
  });
});
