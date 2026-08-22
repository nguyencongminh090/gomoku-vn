/**
 * TODO.md #145 — the socket used to be created at the tail of the ES-module
 * graph (`index-entry.js` → … → `lobby.js`), and `type="module"` is deferred,
 * so the handshake could not start until the whole document had parsed. A HAR
 * from the live site measured 462 ms elapsing before `io()` was even called —
 * larger than the 543 ms WebSocket entry everyone was looking at.
 *
 * The fix creates the client from a classic `<head>` script (socket-early.js)
 * so the ~321 ms TCP+TLS overlaps HTML parsing. That deliberately separates
 * *creating* the socket from *using* it, which is the exact shape of the #51
 * bug: two socket.io connections from one page trip the server's
 * single-device-per-token eviction and the page kicks its own player to login
 * with "đăng nhập ở một thiết bị khác".
 *
 * So most of what is guarded here is not the speed — it is the two ways this
 * change could quietly reintroduce a second connection:
 *   1. runtime: both callers constructing their own client;
 *   2. load-order: session.js/socket-client.js being loaded twice, once as a
 *      classic <head> script and once as an ES module specifier, which
 *      evaluates the file a second time (that IS how #51 shipped).
 * Plus the ordering constraint that makes the fix worth anything at all: a
 * classic script placed after a stylesheet link waits on that stylesheet.
 *
 * @jest-environment jsdom
 */

'use strict';

const fs = require('fs');
const path = require('path');

const CLIENT_DIR = path.join(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(CLIENT_DIR, ...p), 'utf8');

const SOCKET_CLIENT_JS = read('js', 'socket-client.js');
const SOCKET_EARLY_JS = read('js', 'socket-early.js');
const INDEX_HTML = read('index.html');
const INDEX_ENTRY_JS = read('js', 'index-entry.js');

function makeSocketStub() {
  return {
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    io: { on: jest.fn() },
    auth: {},
  };
}

/**
 * Put a page in the state index.html's <head> leaves it in: `io` available,
 * GvnSession available, socket-client.js evaluated, nothing connected yet.
 *
 * @returns {{ioCalls: object[]}} live array, one entry per io() call
 */
function bootPage({ believedSession = true } = {}) {
  delete window.SocketClient;
  window.__gvnSharedClient = null;

  const ioCalls = [];
  window.io = (options) => {
    ioCalls.push(options);
    return makeSocketStub();
  };
  window.GvnSession = {
    hasBelievedSession: () => believedSession,
    legacyToken: () => null,
    applyServerIdentity: jest.fn(),
    getUser: () => null,
  };
  // eslint-disable-next-line no-eval
  window.eval(SOCKET_CLIENT_JS);
  return { ioCalls };
}

/** Run socket-early.js the way the <head> script tag does. */
function runEarlyScript() {
  // eslint-disable-next-line no-eval
  window.eval(SOCKET_EARLY_JS);
}

describe('#145 — exactly one connection per page', () => {
  test('the early <head> script opens the socket', () => {
    const { ioCalls } = bootPage();
    runEarlyScript();
    expect(ioCalls).toHaveLength(1);
  });

  test('lobby.js asking for the client afterwards reuses it, does not open a second', () => {
    const { ioCalls } = bootPage();
    runEarlyScript();
    const fromLobby = window.SocketClient.shared();
    expect(ioCalls).toHaveLength(1);
    expect(fromLobby).toBe(window.__gvnSharedClient);
  });

  test('repeated shared() calls never open another connection', () => {
    const { ioCalls } = bootPage();
    const a = window.SocketClient.shared();
    const b = window.SocketClient.shared();
    const c = window.SocketClient.shared();
    expect(ioCalls).toHaveLength(1);
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  test('shared() still works when the early script never ran (other pages)', () => {
    // room.html/tournament pages are deliberately out of scope for #145 and
    // have no <head> script — the first shared() must connect there.
    const { ioCalls } = bootPage();
    window.SocketClient.shared();
    expect(ioCalls).toHaveLength(1);
  });

  test('destroy() releases the slot so the next shared() is a live client, not a dead one', () => {
    const { ioCalls } = bootPage();
    const first = window.SocketClient.shared();
    first.destroy();
    expect(window.__gvnSharedClient).toBeNull();

    const second = window.SocketClient.shared();
    expect(second).not.toBe(first);
    expect(second.socket).not.toBeNull();
    expect(ioCalls).toHaveLength(2);
  });

  test('no believed session → bounces to login without opening a socket', () => {
    const replace = jest.fn();
    delete window.location;
    window.location = { replace };

    const { ioCalls } = bootPage({ believedSession: false });
    runEarlyScript();

    expect(ioCalls).toHaveLength(0);
    expect(replace).toHaveBeenCalledWith('login.html');
  });
});

describe('#145 — index.html load order', () => {
  const SOCKET_HEAD_SCRIPTS = [
    '/vendor/socket.io/socket.io.min.js',
    'js/session.js',
    'js/socket-client.js',
    'js/socket-early.js',
  ];

  const head = INDEX_HTML.slice(0, INDEX_HTML.indexOf('</head>'));

  test.each(SOCKET_HEAD_SCRIPTS)('%s is a classic <head> script', (src) => {
    expect(head).toContain(`<script src="${src}`);
  });

  test('all four run before the first stylesheet', () => {
    // The load-bearing assertion of this whole fix. A classic script that sits
    // after a <link rel="stylesheet"> waits for that stylesheet to finish
    // before it executes (it might read the CSSOM). Let these drift below the
    // CSS and the socket opens no earlier than the last stylesheet arrives —
    // the saving is handed straight back, silently, with nothing broken to
    // notice.
    // Match the real tag (rel + href), not the bare string — the explanatory
    // comment right above those scripts quotes `<link rel="stylesheet">`.
    const firstStylesheet = INDEX_HTML.indexOf('<link rel="stylesheet" href=');
    expect(firstStylesheet).toBeGreaterThan(-1);

    for (const src of SOCKET_HEAD_SCRIPTS) {
      expect(INDEX_HTML.indexOf(`<script src="${src}`)).toBeLessThan(firstStylesheet);
    }
  });

  test.each(['js/session.js', 'js/socket-client.js'])(
    '%s is not ALSO pulled in as an ES module (that evaluates it twice — #51)',
    (src) => {
      // Match the import *statement*, not the filename — both files are named
      // in index-entry.js's header comment explaining why they are absent.
      const file = src.replace('js/', '');
      expect(INDEX_ENTRY_JS).not.toMatch(
        new RegExp(`^\\s*import\\s+['"]\\./${file.replace('.', '\\.')}`, 'm')
      );
      expect(INDEX_HTML).not.toContain(`<link rel="modulepreload" href="${src}`);
    }
  );

  test('socket.io.min.js is loaded once, not left behind at the foot of <body> too', () => {
    const occurrences = INDEX_HTML.split('<script src="/vendor/socket.io/socket.io.min.js"').length - 1;
    expect(occurrences).toBe(1);
  });

  test('every ?v= on the page is the same version (cache-busting rule)', () => {
    const versions = new Set(
      [...INDEX_HTML.matchAll(/\?v=(\d+)/g)].map((m) => m[1])
    );
    expect(versions.size).toBe(1);
  });
});
