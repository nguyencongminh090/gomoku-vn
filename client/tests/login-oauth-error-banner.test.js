/**
 * TODO.md #99 / docs/todo/B99-login-js-existing-session-hides-oauth-error-banner.md
 * TODO.md #119 / docs/todo/B119-guest-khong-tao-duoc-tai-khoan-tu-nut-create-account.md
 *
 * client/js/login.js's checkExistingSession() IIFE runs at module load and
 * synchronously bounces the browser to index.html whenever it believes there
 * is already a session (localStorage.gvn_user set). GET /google/callback can
 * redirect to login.html?error=oauth_state|oauth_failed|oauth_not_configured
 * even for a user who already has an unrelated valid session (e.g. trying to
 * link/switch a Google account) — before this fix, the redirect fired before
 * the error-banner code later in the file ever ran, so the user was bounced
 * straight to index.html with no explanation why the Google attempt failed.
 *
 * #119 (this suite's newer cases): the same bounce also fired for a GUEST
 * session, which meant Settings' "Create account" link (an <a href="login.html">)
 * never actually let a guest reach the register form — they bounced straight
 * back before they could see it. Fixed by reading GvnSession.getUser().isGuest
 * and skipping the bounce for guests; non-guest sessions keep the original
 * behavior.
 *
 * client/js/ has no test runner wired to `npm test` for most files (see
 * CLAUDE.md's "Bug-fix workflow" note) — this follows the jest-environment-jsdom
 * pattern already established by client/tests/tournament-match-leave-lock.test.js,
 * using the real login.html body as the DOM fixture.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, '..', 'login.html');
const BODY_HTML = (() => {
  const html = fs.readFileSync(HTML_PATH, 'utf8');
  const match = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  if (!match) throw new Error('login.html: <body> tag not found');
  return match[1];
})();

/**
 * Sets up a fresh DOM (real page markup) plus every global login.js reaches
 * for at module load: GvnSession (session.js), t() (i18n.js), and a
 * jest-mockable window.location so checkExistingSession()'s redirect can be
 * observed without jsdom's "not implemented: navigation" noise.
 */
function setupPage({ believedSession, search, isGuest = false }) {
  document.body.innerHTML = BODY_HTML;

  window.GvnSession = {
    hasBelievedSession: jest.fn(() => believedSession),
    getUser: jest.fn(() => believedSession ? { userId: 'u1', displayName: 'X', isGuest } : null),
    setUser: jest.fn(),
  };
  window.t = jest.fn((key) => key);

  delete window.location;
  window.location = {
    search,
    pathname: '/login.html',
    href: `http://localhost/login.html${search}`,
    replace: jest.fn(),
  };
  window.history.replaceState = jest.fn();
}

function loadLoginModule() {
  jest.resetModules();
  require('../js/login.js');
}

function alertBanner() {
  return document.getElementById('alert-banner');
}

describe('login.js OAuth error banner vs existing-session redirect (TODO.md #99)', () => {
  test('no existing session, no error param: no redirect, no banner (the common case)', () => {
    setupPage({ believedSession: false, search: '' });
    loadLoginModule();

    expect(window.location.replace).not.toHaveBeenCalled();
    expect(alertBanner().classList.contains('visible')).toBe(false);
  });

  test('existing session, no error param: redirects to index.html as before', () => {
    setupPage({ believedSession: true, search: '' });
    loadLoginModule();

    expect(window.location.replace).toHaveBeenCalledWith('index.html');
  });

  test('existing session + error=oauth_state: does NOT redirect, shows the error banner instead', () => {
    setupPage({ believedSession: true, search: '?error=oauth_state' });
    loadLoginModule();

    expect(window.location.replace).not.toHaveBeenCalled();
    expect(alertBanner().classList.contains('visible')).toBe(true);
    expect(alertBanner().textContent).toBe('login.err_oauth_fail');
  });

  test('existing session + error=oauth_not_configured: does NOT redirect, shows its own banner message', () => {
    setupPage({ believedSession: true, search: '?error=oauth_not_configured' });
    loadLoginModule();

    expect(window.location.replace).not.toHaveBeenCalled();
    expect(alertBanner().textContent).toBe('login.err_oauth_not_configured');
  });

  test('no existing session + error=oauth_failed: banner shows (unaffected, already worked before this fix)', () => {
    setupPage({ believedSession: false, search: '?error=oauth_failed' });
    loadLoginModule();

    expect(window.location.replace).not.toHaveBeenCalled();
    expect(alertBanner().textContent).toBe('login.err_oauth_fail');
  });
});

describe('login.js does not bounce a guest session (TODO.md #119)', () => {
  test('guest session, no error param: does NOT redirect, so the register form stays reachable', () => {
    setupPage({ believedSession: true, search: '', isGuest: true });
    loadLoginModule();

    expect(window.location.replace).not.toHaveBeenCalled();
  });

  test('non-guest session, no error param: still redirects to index.html (regression check)', () => {
    setupPage({ believedSession: true, search: '', isGuest: false });
    loadLoginModule();

    expect(window.location.replace).toHaveBeenCalledWith('index.html');
  });

  test('guest session + error=oauth_state: still shows the error banner, still no redirect', () => {
    setupPage({ believedSession: true, search: '?error=oauth_state', isGuest: true });
    loadLoginModule();

    expect(window.location.replace).not.toHaveBeenCalled();
    expect(alertBanner().classList.contains('visible')).toBe(true);
  });
});
