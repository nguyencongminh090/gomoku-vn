/**
 * TODO.md #391 — room.html opened its socket only after the whole module graph
 * (13 deferred modules) had loaded and run: `room.js` did `new SocketClient()`.
 * The #145 fix (socket-early.js in <head>) now covers room.html too.
 *
 * Guarded here:
 *   1. load order — the four socket scripts are classic <head> scripts that run
 *      before the first stylesheet (else they wait on the CSS and the saving is lost);
 *   2. one connection — session.js/socket-client.js are not ALSO module imports
 *      (#51: a second evaluation = a second socket = the server evicts the player),
 *      and room.js takes the shared client instead of constructing its own;
 *   3. the join — room:join is emitted exactly once whether `connect` fires
 *      before room-socket.js loads (early socket) or after (slow handshake).
 *
 * @jest-environment jsdom
 */
'use strict';

const fs = require('fs');
const path = require('path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const ROOM_HTML = read('room.html');
const ROOM_ENTRY_JS = read('js', 'room-entry.js');
const ROOM_JS = read('js', 'room.js');

describe('#391 — room.html load order', () => {
  const SOCKET_HEAD_SCRIPTS = [
    'js/session.js',
    '/vendor/socket.io/socket.io.min.js',
    'js/socket-client.js',
    'js/socket-early.js',
  ];
  const head = ROOM_HTML.slice(0, ROOM_HTML.indexOf('</head>'));
  const firstStylesheet = ROOM_HTML.indexOf('<link rel="stylesheet" href=');

  test.each(SOCKET_HEAD_SCRIPTS)('%s is a classic <head> script before the first stylesheet', (src) => {
    const at = head.indexOf(`<script src="${src}`);
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(firstStylesheet);
  });

  test('they run in dependency order (session → io → SocketClient → early)', () => {
    const at = SOCKET_HEAD_SCRIPTS.map((src) => head.indexOf(`<script src="${src}`));
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  });

  test.each(['session.js', 'socket-client.js'])('%s is not ALSO an ES-module import or modulepreload (#51)', (file) => {
    expect(ROOM_ENTRY_JS).not.toMatch(new RegExp(`^\\s*import\\s+['"]\\./${file.replace('.', '\\.')}`, 'm'));
    expect(ROOM_HTML).not.toContain(`<link rel="modulepreload" href="js/${file}`);
  });

  test('socket.io.min.js is loaded once (not left at the foot of <body> too)', () => {
    expect(ROOM_HTML.split('<script src="/vendor/socket.io/socket.io.min.js"').length - 1).toBe(1);
  });

  test('each asset has exactly one ?v= (cache-busting #265)', () => {
    const byPath = new Map();
    for (const m of ROOM_HTML.matchAll(/([\w./-]+)\?v=([0-9a-f]+)/g)) {
      byPath.set(m[1], (byPath.get(m[1]) || new Set()).add(m[2]));
    }
    expect([...byPath].filter(([, v]) => v.size > 1)).toEqual([]);
  });

  test('room.js takes the shared client, never constructs its own', () => {
    expect(ROOM_JS).toMatch(/window\.RoomClient\s*=\s*SocketClient\.shared\(\)/);
    expect(ROOM_JS).not.toMatch(/new\s+SocketClient\s*\(/);
  });
});

describe('#391 — exactly one socket on the room page', () => {
  test('socket-early.js then room.js → one io() call, RoomClient is the early client', () => {
    delete window.SocketClient;
    window.__gvnSharedClient = null;
    let ioCalls = 0;
    window.io = () => {
      ioCalls++;
      return { on: jest.fn(), off: jest.fn(), emit: jest.fn(), disconnect: jest.fn(), io: { on: jest.fn() }, auth: {} };
    };
    window.GvnSession = { hasBelievedSession: () => true, legacyToken: () => null, applyServerIdentity: jest.fn(), getUser: () => null, requireAuth: jest.fn() };
    window.eval(read('js', 'socket-client.js'));
    window.eval(read('js', 'socket-early.js'));
    const early = window.__gvnSharedClient;
    // room.js's own line, run the way the module does it.
    const line = ROOM_JS.match(/window\.RoomClient\s*=\s*SocketClient\.shared\(\);/)[0];
    window.eval(line.replace('SocketClient', 'window.SocketClient'));
    expect(ioCalls).toBe(1);
    expect(window.RoomClient).toBe(early);
  });
});

describe('#391 — room:join emitted once, early or late connect', () => {
  const JS = (n) => read('js', n);

  function load({ connected }) {
    document.body.innerHTML = '<div id="board-area"></div><div id="chat-messages"></div><div id="room-entry-overlay"></div>';
    const client = {
      socket: { connected }, listeners: {}, plainEmits: [],
      on(e, cb) { (this.listeners[e] = this.listeners[e] || []).push(cb); return this; },
      emit(e, d) { this.plainEmits.push({ event: e, data: d }); },
      emitAck() {},
      fire(e, d) { (this.listeners[e] || []).forEach((cb) => cb(d)); },
    };
    window.RoomClient = client;
    window.ChatUI = { appendSystemMessage: jest.fn(), appendChatMessage: jest.fn(), showFloatMessage: jest.fn() };
    window.RoomUI = { updateUI: jest.fn() };
    window.RoomState = { myUser: { userId: 'me' }, roomData: null, predictedTurn: { active: false }, boardRenderer: null };
    window.eval(JS('timer-sync-core.js'));
    window.eval(JS('i18n.js'));
    window.eval(JS('game-ui.js'));
    window.eval(JS('room-socket.js'));
    return client;
  }
  const joins = (c) => c.plainEmits.filter((x) => x.event === 'room:join' || x.event === 'room:create');

  beforeEach(() => {
    jest.useFakeTimers();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/room.html?id=%23ABC');
  });
  afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

  test('early: already connected when room-socket.js loads → one join; a later connect adds none', () => {
    const c = load({ connected: true });
    expect(joins(c)).toEqual([{ event: 'room:join', data: { roomId: '#ABC' } }]);
    c.fire('connect');
    expect(joins(c)).toHaveLength(1);
  });

  test('late: not yet connected → nothing until connect, then exactly one join', () => {
    const c = load({ connected: false });
    expect(joins(c)).toHaveLength(0);
    c.fire('connect');
    c.fire('connect');
    expect(joins(c)).toEqual([{ event: 'room:join', data: { roomId: '#ABC' } }]);
  });

  test('sessionStorage create intent is consumed once, early connect', () => {
    sessionStorage.setItem('gvn_room_intent', JSON.stringify({ action: 'create', settings: { boardSize: 15 } }));
    const c = load({ connected: true });
    c.fire('connect');
    expect(joins(c)).toEqual([{ event: 'room:create', data: { settings: { boardSize: 15 } } }]);
    expect(sessionStorage.getItem('gvn_room_intent')).toBeNull();
  });
});
