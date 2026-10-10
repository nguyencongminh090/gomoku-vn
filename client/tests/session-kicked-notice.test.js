/**
 * #206 trap — a locked account's live socket is closed with session:kicked {code:'ACCOUNT_LOCKED'}.
 * The client must tell the user it was locked, not "signed in on another device" (the old only reason).
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SOCKET_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'socket-client.js'), 'utf8');
const LOGIN_BODY = fs.readFileSync(path.join(__dirname, '..', 'login.html'), 'utf8').match(/<body[^>]*>([\s\S]*)<\/body>/i)[1];

/** Construct a SocketClient on a stub socket and return the handler it registered for `session:kicked`. */
function kickedHandler() {
  const handlers = {};
  const stub = { on: (ev, fn) => { handlers[ev] = fn; }, off: jest.fn(), emit: jest.fn(), disconnect: jest.fn(), io: { on: jest.fn() }, auth: {} };
  delete window.SocketClient;
  window.io = () => stub;
  window.GvnSession = { hasBelievedSession: () => true, legacyToken: () => null, applyServerIdentity: jest.fn(), getUser: () => null };
  window.eval(SOCKET_SRC);
  const client = new window.SocketClient();
  client.destroy = jest.fn();
  delete window.location;
  window.location = { search: '', replace: jest.fn() };
  return handlers['session:kicked'];
}

function openLoginPage() {
  document.body.innerHTML = LOGIN_BODY;
  window.GvnSession = { hasBelievedSession: jest.fn(() => false), getUser: jest.fn(() => null), setUser: jest.fn() };
  window.t = jest.fn((k) => k);
  delete window.location;
  window.location = { search: '', pathname: '/login.html', href: 'http://localhost/login.html', replace: jest.fn() };
  window.history.replaceState = jest.fn();
  jest.resetModules();
  require('../js/login.js');
  return document.getElementById('alert-banner');
}

beforeEach(() => sessionStorage.clear());

describe('session:kicked → notice on the login page', () => {
  it('another-device kick (no payload / other code) keeps the old notice', () => {
    kickedHandler()();
    expect(sessionStorage.getItem('gvn_kicked_notice')).toBe('1');
    kickedHandler()({ code: 'SESSION_KICKED' });
    expect(sessionStorage.getItem('gvn_kicked_notice')).toBe('1');
    expect(window.location.replace).toHaveBeenCalledWith('login.html');
    const banner = openLoginPage();
    expect(banner.textContent).toBe('login.session_kicked');
    expect(sessionStorage.getItem('gvn_kicked_notice')).toBeNull(); // one-time
  });

  it('an account-lock kick shows "account locked" instead', () => {
    kickedHandler()({ code: 'ACCOUNT_LOCKED' });
    expect(sessionStorage.getItem('gvn_kicked_notice')).toBe('locked');
    const banner = openLoginPage();
    expect(banner.classList.contains('visible')).toBe(true);
    expect(banner.textContent).toBe('login.err_account_locked');
    expect(sessionStorage.getItem('gvn_kicked_notice')).toBeNull();
  });

  it('no kick → no banner', () => {
    expect(openLoginPage().classList.contains('visible')).toBe(false);
  });
});
