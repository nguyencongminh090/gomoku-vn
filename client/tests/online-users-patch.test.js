/**
 * @jest-environment jsdom
 */
/*
 * #230: lobby.js applies `lobby:online_patch` ({ joined, left }) to the list it got from the
 * `lobby:online_users` snapshot, then feeds the online line + PrivateChat. lobby.js opens a socket on
 * import, so the handler slice is cut from source (as lobby-room-tabs.test.js does) and run with a
 * stub client.
 */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js/lobby.js'), 'utf8');
const slice = (from, to) => SRC.slice(SRC.indexOf(from), SRC.indexOf(to));
const HANDLERS = slice('// Apply a `lobby:online_patch`', "client.on('room:error'");

const u = (userId, displayName = userId) => ({ userId, displayName, isGuest: false });
let handlers, fed, fedTotals, rendered;

beforeEach(() => {
  handlers = {}; fed = []; fedTotals = []; rendered = 0;
  window.__h = handlers;
  window.PrivateChat = { updateOnlineUsers: (list, total) => { fed.push(list); fedTotals.push(total); } };
  window.__render = () => { rendered++; };
  window.eval(`
    var client = { on: (ev, fn) => { window.__h[ev] = fn; } };
    var currentOnlineUsers = [];
    var currentOnlineTotal = 0;
    var renderOnlineLine = () => window.__render();
    ${HANDLERS}
    window.__current = () => currentOnlineUsers;
    window.__total = () => currentOnlineTotal;
  `);
});

const ids = () => window.__current().map((x) => x.userId);

describe('online users snapshot + patch', () => {
  it('snapshot replaces the list and feeds the online line + PrivateChat', () => {
    handlers['lobby:online_users']([u('a'), u('b')]);
    expect(ids()).toEqual(['a', 'b']);
    expect(rendered).toBe(1);
    expect(fed[0].map((x) => x.userId)).toEqual(['a', 'b']);
  });

  it('patch adds joined, removes left, keeps displayName order', () => {
    handlers['lobby:online_users']([u('a', 'Anna'), u('c', 'Cid')]);
    handlers['lobby:online_patch']({ joined: [u('b', 'bob')], left: ['c'] });
    expect(ids()).toEqual(['a', 'b']);
    expect(fed.at(-1).map((x) => x.userId)).toEqual(['a', 'b']);
    expect(rendered).toBe(2);
  });

  it('is idempotent: joined already held is replaced, left never held is ignored', () => {
    handlers['lobby:online_users']([u('a', 'Alice')]);
    handlers['lobby:online_patch']({ joined: [u('a', 'Alicia')], left: ['zz'] });
    expect(window.__current()).toEqual([u('a', 'Alicia')]);
    handlers['lobby:online_patch']({ joined: [u('a', 'Alicia')], left: ['zz'] });
    expect(window.__current()).toEqual([u('a', 'Alicia')]);
  });

  it('a new snapshot (resubscribe/reconnect) discards the patched state', () => {
    handlers['lobby:online_users']([u('a')]);
    handlers['lobby:online_patch']({ joined: [u('b')], left: [] });
    handlers['lobby:online_users']([u('c')]);
    expect(ids()).toEqual(['c']);
  });

  // #381: only the first page is sent; the count comes from `total` on a patch while truncated.
  it('total from a patch is the count; without it the count is the list length', () => {
    handlers['lobby:online_users']([u('a'), u('b')]);
    expect(window.__total()).toBe(2);
    handlers['lobby:online_patch']({ joined: [], left: [], total: 9000 });
    expect(ids()).toEqual(['a', 'b']);
    expect(window.__total()).toBe(9000);
    expect(fedTotals.at(-1)).toBe(9000);
    handlers['lobby:online_patch']({ joined: [u('c')], left: [] }); // list complete again
    expect(window.__total()).toBe(3);
  });

  it.each([[{ joined: [], left: [], total: 1 }, 2], [{ joined: [], left: [], total: 'x' }, 2], [{ joined: [], left: [], total: -4 }, 2]])(
    'a total below the list length or not a number is ignored: %j', (patch, expected) => {
      handlers['lobby:online_users']([u('a'), u('b')]);
      handlers['lobby:online_patch'](patch);
      expect(window.__total()).toBe(expected);
    });

  it('tolerates a malformed payload', () => {
    handlers['lobby:online_users'](null);
    handlers['lobby:online_patch']({});
    expect(ids()).toEqual([]);
  });
});

// The lobby faces drew initials for everyone: renderOnlineLine passed `null` as the url instead of the
// member's avatarUrl from the online payload.
describe('renderOnlineLine avatars', () => {
  it('passes each user\'s avatarUrl to PlatformShell.avatar (null for guests / no photo)', () => {
    const RENDER = slice('function renderOnlineLine()', '// Apply a `lobby:online_patch`');
    const calls = [];
    window.__calls = calls;
    window.PlatformShell = { avatar: (url, name) => { calls.push([url, name]); const s = document.createElement('span'); s.className = 'pav'; return s; } };
    document.body.innerHTML = '<div id="online-line"><span id="online-line-names"></span></div>';
    window.eval(`
      var userInfo = { userId: 'me' };
      var t = (k) => k; var setNum = () => {};
      var escapeAttr = (s) => String(s);
      var onlineCountEl = null, onlineLineCountEl = null;
      var onlineLineEl = document.getElementById('online-line');
      var onlineLineNamesEl = document.getElementById('online-line-names');
      var ONLINE_NAME_LIMIT = 6;
      var currentOnlineTotal = window.__seedTotal || 0;
      var currentOnlineUsers = [
        { userId: 'me', displayName: 'Me', isGuest: false, avatarUrl: '/api/profile/avatar/me.webp?v=3' },
        { userId: 'b', displayName: 'Bob', isGuest: false, avatarUrl: null },
        { userId: 'g', displayName: 'Gus', isGuest: true, avatarUrl: null },
      ];
      ${RENDER}
      renderOnlineLine();
    `);
    expect(calls).toEqual([['/api/profile/avatar/me.webp?v=3', 'Me'], [null, 'Bob'], [null, 'Gus']]);
  });

  it('#381: "+N" counts the people beyond the page, not only beyond the six faces', () => {
    const RENDER = slice('function renderOnlineLine()', '// Apply a `lobby:online_patch`');
    window.PlatformShell = { avatar: () => document.createElement('span') };
    document.body.innerHTML = '<div id="online-line"><span id="online-line-count"></span><span id="online-line-names"></span></div>';
    window.eval(`
      var userInfo = { userId: 'me' };
      var t = (k) => k; var setNum = () => {};
      var escapeAttr = (s) => String(s);
      var onlineCountEl = null, onlineLineCountEl = document.getElementById('online-line-count');
      var onlineLineEl = document.getElementById('online-line');
      var onlineLineNamesEl = document.getElementById('online-line-names');
      var ONLINE_NAME_LIMIT = 6;
      var currentOnlineTotal = 9000;
      var currentOnlineUsers = Array.from({ length: 50 }, (_, i) => ({ userId: 'u' + i, displayName: 'U' + i, isGuest: false, avatarUrl: null }));
      ${RENDER}
      renderOnlineLine();
    `);
    expect(document.getElementById('online-line-count').textContent).toBe('9000');
    expect(document.querySelector('.online-line__more').textContent).toBe('+8994');
  });
});
