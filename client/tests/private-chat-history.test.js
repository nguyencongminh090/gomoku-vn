/**
 * #198 follow-up — lobby floating chat windows load the saved conversation.
 * private-chat.js is an ES module importing lobby.js; the test strips that import
 * and evals the rest against a stub client (same technique as the other client suites).
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'private-chat.js'), 'utf8')
  .replace(/^import .*$/m, 'const client = window.__client;');

const flush = () => new Promise((r) => setTimeout(r, 0));
const json = (body, status = 200) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

function boot({ user = { userId: 'me', displayName: 'Me', isGuest: false }, fetchImpl }) {
  document.body.innerHTML = '<div id="private-chat-container"></div><div id="modal-online-users"><ul id="online-users-list"></ul><input id="online-users-search"></div>';
  window.__client = { on: jest.fn(), emit: jest.fn() };
  window.GvnSession = { getUser: () => user };
  window.EscapeUtils = require('../js/escape-utils.js');
  window.t = (k) => k;
  global.fetch = jest.fn(fetchImpl);
  window.eval(SRC);
  window.PrivateChat.init();
  window.PrivateChat.updateOnlineUsers([{ userId: 'u2', displayName: 'Bob' }]);
}
const bubbles = () => [...document.querySelectorAll('.pm-window .pm-msg')].map((r) => (r.classList.contains('pm-msg--self') ? '> ' : '') + r.textContent);

describe('private chat window history', () => {
  it('opening a window shows the saved thread (decoded, mine = self) and marks it read', async () => {
    const calls = [];
    boot({ fetchImpl: (url, opts) => {
      calls.push([opts && opts.method || 'GET', url]);
      if (url === '/api/dm/id/u2') return json({ messages: [
        { id: 1, mine: false, text: '&lt;b&gt;hi&lt;/b&gt;', read: false },
        { id: 2, mine: true, text: 'yo', read: true },
      ] });
      return json({ unread: 0 });
    } });
    window.PrivateChat.openChat('u2');
    await flush(); await flush();
    expect(bubbles()).toEqual(['<b>hi</b>', '> yo']);
    expect(document.querySelector('.pm-msg b')).toBeNull();
    expect(calls).toEqual([['GET', '/api/dm/id/u2'], ['POST', '/api/dm/id/u2/read']]);
  });

  it('a live message that raced the fetch is not duplicated and history goes in front of it', async () => {
    let release;
    boot({ fetchImpl: () => new Promise((r) => { release = () => r({ ok: true, status: 200, json: () => Promise.resolve({ messages: [
      { id: 5, mine: false, text: 'old', read: true }, { id: 6, mine: false, text: 'dup', read: true },
    ] }) }); }) });
    window.PrivateChat.openChat('u2');
    const handler = window.__client.on.mock.calls.find((c) => c[0] === 'private_message:receive')[1];
    handler({ messageId: '6', fromUserId: 'u2', conversationWith: 'u2', text: 'dup', timestamp: 1 });
    release();
    await flush(); await flush();
    expect(bubbles()).toEqual(['old', 'dup']);
  });

  it('guests never fetch; a 404/403 or network failure leaves a working empty window', async () => {
    boot({ user: { userId: 'g', displayName: 'G', isGuest: true }, fetchImpl: () => json({}) });
    window.PrivateChat.openChat('u2');
    await flush();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(document.querySelectorAll('.pm-window')).toHaveLength(1);

    boot({ fetchImpl: () => json({}, 404) });
    window.PrivateChat.openChat('u2');
    await flush(); await flush();
    expect(bubbles()).toEqual([]);
    boot({ fetchImpl: () => Promise.reject(new Error('offline')) });
    window.PrivateChat.openChat('u2');
    await flush(); await flush();
    expect(document.querySelectorAll('.pm-window')).toHaveLength(1);
  });
});
