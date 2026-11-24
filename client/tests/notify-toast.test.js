/**
 * F444 — live `notify:new` for a room invite / its decline raises a toast: PlatformShell.toast on shell pages,
 * window.showToast on the room page (no shell there). Other notification types stay silent.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SOCKET_SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'socket-client.js'), 'utf8');

function notifyHandler() {
  const handlers = {};
  const stub = { on: (ev, fn) => { handlers[ev] = fn; }, off: jest.fn(), emit: jest.fn(), disconnect: jest.fn(), io: { on: jest.fn() }, auth: {} };
  delete window.SocketClient;
  window.io = () => stub;
  window.GvnSession = { hasBelievedSession: () => true, legacyToken: () => null, applyServerIdentity: jest.fn(), getUser: () => null };
  window.eval(SOCKET_SRC);
  new window.SocketClient(); // eslint-disable-line no-new
  return handlers['notify:new'];
}
const INVITE = { id: 1, type: 'room_invite', payload: { roomName: '#ABC', from: { username: 'ann', displayName: 'ANN' } } };

beforeEach(() => {
  window.t = jest.fn((k, v) => k + JSON.stringify(v));
  delete window.PlatformShell;
  delete window.showToast;
});

describe('notify:new toast', () => {
  it('shell page: pushes into the bell and toasts through PlatformShell.toast', () => {
    window.PlatformShell = { pushNotification: jest.fn(), toast: jest.fn() };
    notifyHandler()(INVITE);
    expect(window.PlatformShell.pushNotification).toHaveBeenCalledWith(INVITE);
    expect(window.PlatformShell.toast).toHaveBeenCalledWith('notif.room_invite{"name":"ANN","room":"#ABC"}');
  });

  it('room page (no shell): falls back to window.showToast, info style', () => {
    window.showToast = jest.fn();
    notifyHandler()({ ...INVITE, type: 'room_invite_declined' });
    expect(window.showToast).toHaveBeenCalledWith('notif.room_invite_declined{"name":"ANN","room":"#ABC"}', 'info');
  });

  it('other notification types do not toast; no toast function anywhere does not throw', () => {
    window.PlatformShell = { pushNotification: jest.fn(), toast: jest.fn() };
    notifyHandler()({ id: 2, type: 'friend_request', payload: { from: { username: 'b', displayName: 'B' } } });
    expect(window.PlatformShell.toast).not.toHaveBeenCalled();
    delete window.PlatformShell;
    expect(() => notifyHandler()(INVITE)).not.toThrow();
  });
});
