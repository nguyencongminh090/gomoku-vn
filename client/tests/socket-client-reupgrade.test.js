/**
 * #434 — after a reconnect whose websocket handshake failed, engine.io stays on HTTP long-polling for the
 * page's whole life (no upgrade retry), so play lags until a reload. SocketClient now closes a polling
 * engine at a quiet moment so the SAME Manager reconnects websocket-first (never a second socket, #145).
 * @jest-environment jsdom
 */
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'socket-client.js'), 'utf8');

function makeEngine(name) { return { transport: { name }, close: jest.fn() }; }

function setup(transport = 'polling') {
  const connectCbs = [];
  const engine = makeEngine(transport);
  const sock = {
    connected: true,
    auth: {},
    on: jest.fn((e, cb) => { if (e === 'connect') connectCbs.push(cb); }),
    off: jest.fn(),
    emit: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
    io: { on: jest.fn(), engine },
    // #435 liveness probe: acked at once (a pending probe is a non-quiet moment — tested below)
    timeout: jest.fn(() => ({ emit: (ev, data, cb) => (sock.pendingAck ? sock.acks.push(cb) : cb(null)) })),
    acks: [],
    pendingAck: false,
  };
  delete window.SocketClient;
  window.__gvnSharedClient = null;
  window.io = () => sock;
  window.GvnSession = { hasBelievedSession: () => true, legacyToken: () => null, applyServerIdentity() {} };
  window.eval(SRC);
  const client = new window.SocketClient();
  const SC = window.SocketClient;
  const connect = () => connectCbs.forEach((cb) => cb());
  // A reconnect = a new engine on the same Manager, then 'connect'.
  const reconnect = (name) => { sock.io.engine = makeEngine(name); sock.connected = true; connect(); return sock.io.engine; };
  return { sock, engine, client, SC, connect, reconnect };
}
function setHidden(v) { Object.defineProperty(document, 'hidden', { configurable: true, get: () => v }); }

describe('#434 leave a stuck long-polling transport', () => {
  beforeEach(() => { jest.useFakeTimers(); setHidden(false); });
  afterEach(() => { jest.useRealTimers(); setHidden(false); });

  test('connected on polling → engine closed after the first backoff, not before', () => {
    const { engine, SC, connect } = setup('polling');
    connect();
    jest.advanceTimersByTime(SC.REUPGRADE_DELAYS_MS[0] - 1);
    expect(engine.close).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(engine.close).toHaveBeenCalledTimes(1);
  });

  test('connected on websocket → never closed', () => {
    const { engine, connect } = setup('websocket');
    connect();
    jest.advanceTimersByTime(60 * 60 * 1000);
    expect(engine.close).not.toHaveBeenCalled();
  });

  test('upgraded to websocket on its own before the timer → left alone', () => {
    const { engine, SC, connect } = setup('polling');
    connect();
    engine.transport = { name: 'websocket' };
    jest.advanceTimersByTime(SC.REUPGRADE_DELAYS_MS[0]);
    expect(engine.close).not.toHaveBeenCalled();
  });

  test('stale socket / replaced engine / disconnected → no-op', () => {
    const a = setup('polling');
    a.connect();
    a.sock.io.engine = makeEngine('polling'); // Manager already replaced it
    jest.advanceTimersByTime(a.SC.REUPGRADE_DELAYS_MS[0]);
    expect(a.engine.close).not.toHaveBeenCalled();

    const b = setup('polling');
    b.connect();
    b.sock.connected = false;
    jest.advanceTimersByTime(b.SC.REUPGRADE_DELAYS_MS[0]);
    expect(b.engine.close).not.toHaveBeenCalled();

    const c = setup('polling');
    c.connect();
    c.client.destroy();
    jest.advanceTimersByTime(c.SC.REUPGRADE_DELAYS_MS[0]);
    expect(c.engine.close).not.toHaveBeenCalled();
  });

  test('hidden tab → waits, closes once visible again', () => {
    const { engine, SC, connect } = setup('polling');
    connect();
    setHidden(true);
    jest.advanceTimersByTime(SC.REUPGRADE_DELAYS_MS[0] + SC.REUPGRADE_RECHECK_MS * 3);
    expect(engine.close).not.toHaveBeenCalled();
    setHidden(false);
    jest.advanceTimersByTime(SC.REUPGRADE_RECHECK_MS);
    expect(engine.close).toHaveBeenCalledTimes(1);
  });

  test('page says not quiet (own game running) → waits; throwing hook counts as not quiet', () => {
    const { engine, client, SC, connect } = setup('polling');
    let playing = true;
    client.quietReconnectOk = () => !playing;
    connect();
    jest.advanceTimersByTime(SC.REUPGRADE_DELAYS_MS[0] + SC.REUPGRADE_RECHECK_MS * 4);
    expect(engine.close).not.toHaveBeenCalled();
    client.quietReconnectOk = () => { throw new Error('x'); };
    jest.advanceTimersByTime(SC.REUPGRADE_RECHECK_MS);
    expect(engine.close).not.toHaveBeenCalled();
    playing = false;
    client.quietReconnectOk = () => !playing;
    jest.advanceTimersByTime(SC.REUPGRADE_RECHECK_MS);
    expect(engine.close).toHaveBeenCalledTimes(1);
  });

  test('liveness probe awaiting its ack → waits for the next recheck', () => {
    const { sock, engine, SC, connect } = setup('polling');
    connect();
    sock.pendingAck = true;
    jest.advanceTimersByTime(SC.REUPGRADE_DELAYS_MS[0]);
    expect(sock.acks.length).toBeGreaterThan(0);
    expect(engine.close).not.toHaveBeenCalled();
    sock.pendingAck = false;
    sock.acks.splice(0).forEach((cb) => cb(null));
    jest.advanceTimersByTime(SC.REUPGRADE_RECHECK_MS);
    expect(engine.close).toHaveBeenCalledTimes(1);
  });

  test('backoff grows per polling reconnect, then gives up (websocket really blocked)', () => {
    const { engine, SC, connect, reconnect } = setup('polling');
    connect();
    let cur = engine;
    for (const ms of SC.REUPGRADE_DELAYS_MS) {
      jest.advanceTimersByTime(ms - 1);
      expect(cur.close).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(cur.close).toHaveBeenCalledTimes(1);
      cur = reconnect('polling');
    }
    jest.advanceTimersByTime(24 * 60 * 60 * 1000);
    expect(cur.close).not.toHaveBeenCalled();
  });

  test('a websocket connect resets the backoff', () => {
    const { SC, connect, reconnect } = setup('polling');
    connect();
    jest.advanceTimersByTime(SC.REUPGRADE_DELAYS_MS[0]);
    reconnect('polling');
    jest.advanceTimersByTime(SC.REUPGRADE_DELAYS_MS[1]);
    reconnect('websocket');
    const again = reconnect('polling'); // later network switch → polling again
    jest.advanceTimersByTime(SC.REUPGRADE_DELAYS_MS[0]);
    expect(again.close).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['viewer, game ongoing', { mySlot: null, gameState: { status: 'ongoing' } }, true],
    ['no state yet', null, true],
    ['seated, no game', { mySlot: 1, gameState: null }, true],
    ['seated, game finished', { mySlot: 2, gameState: { status: 'finished' } }, true],
    ['seated, game ongoing', { mySlot: 1, gameState: { status: 'ongoing' } }, false],
    ['seated, opponent dropped (interrupted)', { mySlot: 1, gameState: { status: 'interrupted' } }, false],
    ['seated and ready, no game', { mySlot: 1, isReady: true, gameState: null }, false],
  ])('seatIsQuiet: %s → %s', (_l, st, want) => {
    const { SC } = setup();
    expect(SC.seatIsQuiet(st)).toBe(want);
  });

  test('backoff is bounded (a blocked-websocket network is dropped a few times, not forever)', () => {
    const { SC } = setup();
    expect(SC.REUPGRADE_DELAYS_MS.length).toBeLessThanOrEqual(3);
    expect(SC.REUPGRADE_DELAYS_MS[0]).toBeGreaterThanOrEqual(10000);
  });
});
