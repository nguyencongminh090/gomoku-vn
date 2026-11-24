/**
 * @jest-environment jsdom
 */
/*
 * #230: lobby.js applies `lobby:online_patch` ({ joined, left }) to the list it got from the
 * `lobby:online_users` snapshot, then feeds the counts (#440: stats bar + roster rail, rooms-h.test.js) + PrivateChat. lobby.js opens a socket on
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
    var renderOnlineCount = () => window.__render();
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
