'use strict';

const { legacyHostRedirect } = require('../middleware/legacy-host-redirect');

function run(mw, { method = 'GET', host = 'old.example', url = '/', headers = {} } = {}) {
  const res = { redirect: jest.fn() };
  const next = jest.fn();
  mw({ method, url, originalUrl: url, headers: { host, 'sec-fetch-dest': 'document', ...headers } }, res, next);
  return { res, next };
}
const mw = legacyHostRedirect({ hosts: 'old.example, Other.Example', canonical: 'https://new.example/' });

describe('legacyHostRedirect', () => {
  test('page navigation on a legacy host → 302 to the same path+query on the canonical origin', () => {
    const { res, next } = run(mw, { url: '/room.html?code=ABC#x' });
    expect(res.redirect).toHaveBeenCalledWith(302, 'https://new.example/room.html?code=ABC#x');
    expect(next).not.toHaveBeenCalled();
    expect(run(mw, { host: 'OTHER.example:3000', url: '/' }).res.redirect).toHaveBeenCalledWith(302, 'https://new.example/');
  });

  test('canonical host and unknown hosts pass through', () => {
    expect(run(mw, { host: 'new.example' }).next).toHaveBeenCalled();
    expect(run(mw, { host: 'localhost:3000' }).next).toHaveBeenCalled();
  });

  test('old-host API, socket.io, OAuth landing and non-document requests are left alone', () => {
    for (const url of ['/api/auth/guest', '/socket.io/?EIO=4', '/oauth-complete.html', '/api']) {
      expect(run(mw, { url }).next).toHaveBeenCalled();
    }
    expect(run(mw, { url: '/js/app.js', headers: { 'sec-fetch-dest': 'script' } }).next).toHaveBeenCalled();
    expect(run(mw, { url: '/sw.js', headers: { 'sec-fetch-dest': 'serviceworker' } }).next).toHaveBeenCalled();
  });

  test('no Sec-Fetch-Dest: falls back to Accept text/html', () => {
    const h = { 'sec-fetch-dest': undefined };
    expect(run(mw, { headers: { ...h, accept: 'text/html,*/*' } }).res.redirect).toHaveBeenCalled();
    expect(run(mw, { headers: { ...h, accept: 'application/json' } }).next).toHaveBeenCalled();
  });

  test('writes are never redirected; unset config is a no-op', () => {
    expect(run(mw, { method: 'POST' }).next).toHaveBeenCalled();
    const off = legacyHostRedirect({});
    expect(run(off).next).toHaveBeenCalled();
    expect(run(legacyHostRedirect({ hosts: 'old.example', canonical: 'new.example' })).next).toHaveBeenCalled();
  });
});
