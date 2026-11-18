'use strict';
const { EngineTransport } = require('./EngineTransport');

/**
 * Scripted transport. `script` = one entry per send(): string[] | (lines, n) => string[] | null (silence).
 * `stopReply`: lines emitted when stop() is called. Lines are delivered asynchronously, one per tick.
 */
class FakeTransport extends EngineTransport {
  constructor(script = [], { stopReply = null } = {}) {
    super();
    this.script = script; this.stopReply = stopReply;
    this.sent = []; this.stops = 0; this.resets = 0; this.closed = false; this._cbs = new Set();
  }
  send(lines) {
    const n = this.sent.length;
    this.sent.push(lines);
    const entry = this.script[Math.min(n, this.script.length - 1)];
    const out = typeof entry === 'function' ? entry(lines, n) : entry;
    if (out) this._emit(out);
  }
  onLine(cb) { this._cbs.add(cb); return () => this._cbs.delete(cb); }
  stop() { this.stops++; if (this.stopReply) this._emit(this.stopReply); }
  reset() { this.resets++; }
  close() { this.closed = true; }
  _emit(lines) {
    setImmediate(() => lines.forEach((l) => { for (const cb of [...this._cbs]) cb(l); }));
  }
}
module.exports = { FakeTransport };
