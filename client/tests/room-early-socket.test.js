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
    'js/room-early-join.js',
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
    expect(ROOM_HTML.split('<script src="/vendor/socket.io/socket.io.min.js?v=').length - 1).toBe(1);
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
    // room-early-join.js only for window.RoomIntent here: a client with no socket
    // makes it skip the early emit, so these cases exercise the module fallback.
    window.SocketClient = { shared: () => ({ socket: null }) };
    window.eval(JS('room-early-join.js'));
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

// ── #393: the join is emitted from <head>, the reply is held for room-socket.js ──

/** Mirrors socket.io-client's Socket: onAny listeners run BEFORE regular ones (emitEvent). */
function fakeSocket() {
  const L = {};
  const any = [];
  return {
    connected: false, auth: {}, io: { on() {} }, emits: [],
    on(e, f) { (L[e] = L[e] || []).push(f); return this; },
    off(e, f) { if (L[e]) L[e] = L[e].filter((x) => x !== f); return this; },
    listeners(e) { return (L[e] || []).slice(); },
    onAny(f) { any.push(f); return this; },
    offAny(f) { const i = any.indexOf(f); if (i >= 0) any.splice(i, 1); return this; },
    emit(e, d) { this.emits.push({ event: e, data: d }); },
    timeout() { return this; },
    disconnect() {},
    deliver(e, ...a) { any.slice().forEach((f) => f(e, ...a)); (L[e] || []).slice().forEach((f) => f(...a)); },
    connectNow() { this.connected = true; (L.connect || []).slice().forEach((f) => f()); },
  };
}

describe('#393 — real socket.io-client delivers to onAny before regular listeners', () => {
  test('Socket.emitEvent runs _anyListeners, then super.emit', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'node_modules', 'socket.io-client', 'build', 'cjs', 'socket.js'), 'utf8');
    const body = src.slice(src.indexOf('emitEvent(args) {'), src.indexOf('emitEvent(args) {') + 600);
    expect(body.indexOf('this._anyListeners')).toBeGreaterThan(-1);
    expect(body.indexOf('this._anyListeners')).toBeLessThan(body.indexOf('super.emit.apply'));
  });
});

describe('#393 — SocketClient.holdEvents / releaseEvents', () => {
  let sock;
  let client;
  beforeEach(() => {
    jest.useFakeTimers();
    delete window.SocketClient;
    window.__gvnSharedClient = null;
    sock = fakeSocket();
    window.io = () => sock;
    window.GvnSession = { hasBelievedSession: () => true, legacyToken: () => null, applyServerIdentity: jest.fn(), getUser: () => null };
    window.eval(read('js', 'socket-client.js'));
    client = window.SocketClient.shared();
  });
  afterEach(() => { client.destroy(); jest.clearAllTimers(); jest.useRealTimers(); });

  test('an event with no listener yet is replayed exactly once, to the late listener', () => {
    client.holdEvents();
    sock.deliver('room:joined', { roomId: '#A' });
    const late = jest.fn();
    client.on('room:joined', late);
    expect(late).not.toHaveBeenCalled();
    client.releaseEvents();
    client.releaseEvents();
    expect(late.mock.calls).toEqual([[{ roomId: '#A' }]]);
  });

  test('a listener that got it live is not called again on release', () => {
    const early = jest.fn();
    client.on('timer:sync', early);
    client.holdEvents();
    sock.deliver('timer:sync', { n: 1 });
    const late = jest.fn();
    client.on('timer:sync', late);
    client.releaseEvents();
    expect(early).toHaveBeenCalledTimes(1);
    expect(late).toHaveBeenCalledTimes(1);
  });

  test('mixed events replay in arrival order, not handler-registration order', () => {
    const order = [];
    client.holdEvents();
    sock.deliver('game:init', 1);
    sock.deliver('room:joined', 2);
    sock.deliver('game:init', 3);
    client.on('room:joined', (d) => order.push(['joined', d]));
    client.on('game:init', (d) => order.push(['init', d]));
    client.releaseEvents();
    expect(order).toEqual([['init', 1], ['joined', 2], ['init', 3]]);
  });

  test('after release nothing is held: later events go live, once', () => {
    client.holdEvents();
    client.releaseEvents();
    const fn = jest.fn();
    client.on('room:updated', fn);
    sock.deliver('room:updated', 'x');
    client.releaseEvents();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('replayAgeMs = time the packet waited in the hold, 0 outside a replay', () => {
    client.holdEvents();
    sock.deliver('room:joined', {});
    jest.advanceTimersByTime(250);
    let seen = null;
    client.on('room:joined', () => { seen = client.replayAgeMs(); });
    client.releaseEvents();
    expect(seen).toBe(250);
    expect(client.replayAgeMs()).toBe(0);
  });

  test('a throwing replayed handler loses only its own event; later events still replay', () => {
    client.holdEvents();
    sock.deliver('game:init', 1);
    sock.deliver('room:joined', 2);
    client.on('game:init', () => { throw new Error('boom'); });
    const joined = jest.fn();
    client.on('room:joined', joined);
    expect(() => client.releaseEvents()).not.toThrow();
    expect(joined).toHaveBeenCalledWith(2);
    expect(client.replayAgeMs()).toBe(0);
    expect(() => jest.runOnlyPendingTimers()).toThrow('boom'); // still reported, asynchronously
  });

  test('the hold is capped (HOLD_MAX)', () => {
    client.holdEvents();
    for (let i = 0; i < window.SocketClient.HOLD_MAX + 5; i++) sock.deliver('x', i);
    const fn = jest.fn();
    client.on('x', fn);
    client.releaseEvents();
    expect(fn).toHaveBeenCalledTimes(window.SocketClient.HOLD_MAX);
  });
});

describe('#393 — room-early-join.js + room-socket.js end to end', () => {
  const JS = (n) => read('js', n);
  let sock;

  function boot() {
    delete window.SocketClient;
    window.__gvnSharedClient = null;
    sock = fakeSocket();
    window.io = () => sock;
    window.GvnSession = { hasBelievedSession: () => true, legacyToken: () => null, applyServerIdentity: jest.fn(), getUser: () => null };
    window.eval(JS('socket-client.js'));
    window.eval(JS('socket-early.js'));
    window.eval(JS('room-early-join.js'));
  }
  function loadModules() {
    document.body.innerHTML = '<div id="board-area"></div><div id="chat-messages"></div><div id="room-entry-overlay" class="visible"></div>';
    window.RoomClient = window.SocketClient.shared();
    window.ChatUI = { appendSystemMessage: jest.fn(), appendChatMessage: jest.fn(), showFloatMessage: jest.fn() };
    window.RoomUI = { updateUI: jest.fn() };
    window.RoomState = { myUser: { userId: 'me' }, roomData: null, predictedTurn: { active: false }, boardRenderer: null };
    window.eval(JS('timer-sync-core.js'));
    window.eval(JS('i18n.js'));
    window.eval(JS('game-ui.js'));
    window.eval(JS('room-socket.js'));
  }
  const joins = () => sock.emits.filter((x) => x.event === 'room:join' || x.event === 'room:create');

  beforeEach(() => {
    jest.useFakeTimers();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/room.html?id=%23ABC');
  });
  afterEach(() => { window.__gvnSharedClient && window.__gvnSharedClient.destroy(); jest.clearAllTimers(); jest.useRealTimers(); });

  test('connect before the modules → join emitted from <head>, reply replayed to room-socket.js, no second join', () => {
    boot();
    sock.connectNow();
    expect(joins()).toEqual([{ event: 'room:join', data: { roomId: '#ABC' } }]);
    const serverTime = Date.now() + 5000; // server clock 5 s ahead
    sock.deliver('room:joined', { roomId: '#ABC', serverTime, settings: {}, users: [] });
    jest.advanceTimersByTime(300); // the module graph loading
    loadModules();
    expect(window.RoomState.roomData && window.RoomState.roomData.roomId).toBe('#ABC');
    // offset taken at arrival, not at replay: serverNow() is 5 s ahead, not 5 s − 300 ms
    expect(window.RoomSocket.serverNow() - Date.now()).toBe(5000);
    sock.connectNow(); // a reconnect
    expect(joins()).toHaveLength(1);
  });

  test('connect after the modules (slow handshake) → still exactly one join', () => {
    boot();
    loadModules();
    expect(joins()).toHaveLength(0);
    sock.connectNow();
    sock.connectNow();
    expect(joins()).toEqual([{ event: 'room:join', data: { roomId: '#ABC' } }]);
  });

  test('create intent is consumed once from <head>', () => {
    sessionStorage.setItem('gvn_room_intent', JSON.stringify({ action: 'create', settings: { boardSize: 15 } }));
    boot();
    sock.connectNow();
    loadModules();
    sock.connectNow();
    expect(joins()).toEqual([{ event: 'room:create', data: { settings: { boardSize: 15 } } }]);
    expect(sessionStorage.getItem('gvn_room_intent')).toBeNull();
  });

  test('room:error for the head join is replayed too → toast + bounce, no join retry', () => {
    boot();
    sock.connectNow();
    sock.deliver('room:error', { code: 'ROOM_NOT_FOUND', message: 'x' });
    window.showToast = jest.fn();
    loadModules();
    expect(window.showToast).toHaveBeenCalledWith(expect.any(String), 'error');
    expect(joins()).toHaveLength(1);
  });

  test('bare room.html (no intent, no ?id=) still bounces to the lobby', () => {
    window.history.replaceState(null, '', '/room.html');
    boot();
    sock.connectNow();
    expect(joins()).toHaveLength(0);
    // jsdom cannot navigate; the href assignment shows up as its "Not implemented: navigation" error
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    loadModules();
    expect(spy.mock.calls.some((c) => String(c[0] && (c[0].message || c[0])).includes('navigation'))).toBe(true);
    spy.mockRestore();
  });
});
