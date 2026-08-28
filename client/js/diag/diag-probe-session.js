'use strict';

/**
 * diag-probe-session.js — the concrete probe that rides `diag:ping` /
 * `diag:pong` on the `/diag` namespace (TODO.md #168 step 4).
 *
 * Everything measured lives in the base class; this file is only the
 * transport binding. That split is the point: a future `RoomProbeSession`
 * would swap these two methods for the room's own socket and inherit
 * identical arithmetic (planning.md code organization).
 *
 * The socket is injected rather than created here so the page owns the
 * connection lifecycle — and so this class is testable without a network.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./latency-probe-session'));
  } else {
    root.DiagProbeSession = factory(root.LatencyProbeSession);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (LatencyProbeSession) {

  class DiagProbeSession extends LatencyProbeSession {
    /**
     * @param {object} opts
     * @param {{emit:function, on:function}} opts.socket a /diag socket
     * @param {...} everything LatencyProbeSession accepts
     */
    constructor(opts = {}) {
      super(opts);
      if (!opts.socket) throw new Error('DiagProbeSession requires a socket');
      this.socket = opts.socket;
      this._bound = false;
    }

    /**
     * Subscribe to `diag:pong`. Separate from `start()` so the page can bind
     * once and run several sessions over one socket without stacking
     * listeners — a duplicate listener would double-count every echo and
     * halve the apparent packet loss.
     */
    bind() {
      if (this._bound) return this;
      this._bound = true;
      this._onPong = (payload) => this.onEcho(payload);
      this.socket.on('diag:pong', this._onPong);
      return this;
    }

    start() {
      this.bind();
      super.start();
    }

    /** @override — one probe onto the wire. */
    _send(seq, clientTs) {
      this.socket.emit('diag:ping', { seq, clientTs });
    }
  }

  return DiagProbeSession;
});
