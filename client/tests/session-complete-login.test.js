/**
 * TODO.md #102 / docs/todo/B102-oauth-client-duplication-and-minor-inefficiency.md
 *
 * login.js's onAuthSuccess() (username/password/guest) and oauth-complete.js's
 * success branch (Google OAuth) used to each hand-write the same "cache the
 * profile, then bounce to index.html" sequence. GvnSession.completeLogin()
 * is the single place both now call — this tests it directly.
 *
 * @jest-environment jsdom
 */

'use strict';

function loadSessionModule() {
  jest.resetModules();
  delete window.location;
  window.location = { replace: jest.fn(), href: 'http://localhost/login.html' };
  localStorage.clear();
  require('../js/session.js');
}

describe('GvnSession.completeLogin (TODO.md #102)', () => {
  test('caches the user profile and redirects to index.html', () => {
    loadSessionModule();
    const user = { userId: 'u1', displayName: 'Alice', isGuest: false, expiresAt: null };

    window.GvnSession.completeLogin(user);

    expect(JSON.parse(localStorage.getItem('gvn_user'))).toEqual(user);
    expect(window.location.replace).toHaveBeenCalledWith('index.html');
  });

  test('a falsy user still redirects, without touching the cache (matches the old onAuthSuccess guard)', () => {
    loadSessionModule();

    window.GvnSession.completeLogin(undefined);

    expect(localStorage.getItem('gvn_user')).toBeNull();
    expect(window.location.replace).toHaveBeenCalledWith('index.html');
  });
});
