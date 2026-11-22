'use strict';
/** #434: share of sockets on long-polling (websocket-first clients whose websocket handshake failed). */
const { EventEmitter } = require('events');
const { createTransportStats } = require('../socket/transport-stats');

function sock(name) {
  const conn = new EventEmitter();
  conn.transport = { name };
  return { conn };
}
function fakeIo(sockets) {
  return { of: () => ({ sockets: new Map(sockets.map((s, i) => [String(i), s])) }) };
}

describe('#434 transport stats', () => {
  test('counts live sockets by transport and polling connects/upgrades since last snapshot', () => {
    const stats = createTransportStats();
    const a = sock('websocket');
    const b = sock('polling');
    const c = sock('polling');
    [a, b, c].forEach((s) => stats.track(s));
    b.conn.transport = { name: 'websocket' };
    b.conn.emit('upgrade');
    b.conn.emit('upgrade'); // once per socket
    const snap = stats.snapshot(fakeIo([a, b, c]));
    expect(snap).toEqual({ websocket: 2, polling: 1, other: 0, pollingConnects: 2, upgrades: 1 });
    // counters reset, live counts recomputed
    expect(stats.snapshot(fakeIo([a]))).toEqual({ websocket: 1, polling: 0, other: 0, pollingConnects: 0, upgrades: 0 });
  });

  test('tolerates sockets without conn/transport', () => {
    const stats = createTransportStats();
    stats.track({});
    stats.track(null);
    expect(stats.snapshot(fakeIo([{}]))).toEqual({ websocket: 0, polling: 0, other: 1, pollingConnects: 0, upgrades: 0 });
  });

  test('start() timer is unref()d (#433)', () => {
    const stats = createTransportStats();
    const t = stats.start(fakeIo([]), 1000);
    expect(t.hasRef()).toBe(false);
    clearInterval(t);
  });
});
