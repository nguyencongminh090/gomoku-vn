'use strict';
/**
 * Where the engine runs (client WASM now, native process later, FakeTransport in tests).
 *   send(lines: string[])        write protocol lines (one job at a time)
 *   onLine(cb) -> unsubscribe    engine output, one line per call
 *   stop()                       ask the engine to stop thinking (STOP) — it still emits a move line
 *   reset()                      discard in-flight output and restore a clean engine (called after error/timeout)
 *   close()                      release the engine
 */
class EngineTransport {
  send() { throw new Error('not implemented'); }
  onLine() { throw new Error('not implemented'); }
  stop() {}
  reset() {}
  close() {}
}
module.exports = { EngineTransport };
