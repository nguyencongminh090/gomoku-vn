'use strict';
/**
 * #434: how many sockets sit on HTTP long-polling instead of websocket. Clients connect websocket-first;
 * a socket on polling means its websocket handshake failed (blocked network, or one failed reconnect —
 * engine.io then never retries the upgrade). One info line per interval, only when anything is connected.
 */
const logger = require('../utils/logger');

function createTransportStats() {
  const counts = { pollingConnects: 0, upgrades: 0 };
  return {
    counts,
    /** Call once per new socket.io connection. */
    track(socket) {
      const conn = socket && socket.conn;
      if (!conn) return;
      if (conn.transport && conn.transport.name === 'polling') counts.pollingConnects++;
      if (typeof conn.once === 'function') conn.once('upgrade', () => { counts.upgrades++; });
    },
    /** Snapshot of live sockets by transport + counters since the last snapshot (then reset). */
    snapshot(io) {
      const live = { websocket: 0, polling: 0, other: 0 };
      for (const s of io.of('/').sockets.values()) {
        const name = s.conn && s.conn.transport && s.conn.transport.name;
        if (name === 'websocket' || name === 'polling') live[name]++;
        else live.other++;
      }
      const out = { ...live, pollingConnects: counts.pollingConnects, upgrades: counts.upgrades };
      counts.pollingConnects = 0;
      counts.upgrades = 0;
      return out;
    },
    /** unref()d interval (#433). */
    start(io, everyMs) {
      const t = setInterval(() => {
        const s = this.snapshot(io);
        if (s.websocket + s.polling + s.other === 0 && s.pollingConnects === 0) return;
        logger.info(`[Transport] live ws=${s.websocket} polling=${s.polling} other=${s.other}; `
          + `since last: polling connects=${s.pollingConnects} upgrades=${s.upgrades}`);
      }, everyMs);
      if (typeof t.unref === 'function') t.unref();
      return t;
    },
  };
}

module.exports = { createTransportStats };
