'use strict';
const crypto = require('crypto');
const { EngineTransport } = require('./EngineTransport');
const { ERR, EngineError } = require('../constants');

/** Caps on what an (untrusted) client may push back per job (design §4). Measured 2026-11-16 (Chromium, single
 *  build): heaviest purpose config = analysis nbest 8 / 5M nodes → 1755 lines, 46 batches, peak 12 batches/s;
 *  verify defaults → 279 lines. Multi build (7 threads) hit 20 batches/s at 64 lines/batch → batches are 256 lines
 *  (client MAX_BATCH) to stay far below the 30 ev/s output bucket and the 50 ev/s socket flood cap. */
const LIMITS = Object.freeze({
  linesPerBatch: 256,
  lineChars: 1024,
  linesPerJob: 12000,
  moveLineChars: 64,
});
const MOVE_LINE = /^(\d{1,2},\d{1,2}( \d{1,2},\d{1,2})*|SWAP)$/;
const BLOCK_START = new Set(['YXBOARD', 'BOARD', 'YXBLOCK', 'SWAP2BOARD']);

/**
 * Protocol lines → engine commands. The WASM build executes ONE command per sendCommand() (gomocupLoopOnce) and
 * reads stdin synchronously: a block (`YXBOARD` … `DONE`) split over several calls hits EOF mid-block and the
 * engine exits(0). So each block travels as one '\n'-joined command; every other line is its own command.
 */
function groupCommands(lines) {
  const out = [];
  let block = null;
  for (const l of lines) {
    if (block) { block.push(l); if (l === 'DONE') { out.push(block.join('\n')); block = null; } }
    else if (BLOCK_START.has(l)) block = [l];
    else out.push(l);
  }
  if (block) throw new EngineError(ERR.BAD_STATE, `unterminated ${block[0]}`);
  return out;
}

/**
 * Engine running in the lease owner's browser (worker). The server stays the protocol brain:
 * send(lines) → `engine:job {leaseId, jobId, commands}` (see groupCommands); the client relays output back with
 * `engine:line {jobId, lines[]}` and the final bare move with `engine:done {jobId, moveLine}`.
 * Exactly one job in flight; output for any other jobId is stale and dropped.
 * stop(), by variant (#408):
 *   single — `engine:stop {jobId, hard:true}`: the build cannot see STOP mid-search, the client terminates + respawns
 *            its worker, no move follows → EngineService's stop grace ends in TIMEOUT → reset(). Normal path.
 *   multi  — `engine:stop {jobId, command:'YXSTOP'}`: the search runs on pthreads, the engine answers with a move.
 * reset() after a failed/unanswered job always sends a hard stop (unless one went out), so a still-thinking engine
 * can never swallow the next job's commands.
 */
const MAX_THREADS = 8;
/** Reported logical cores → engine threads: leave one core to the page, 1..MAX_THREADS. */
function threadsFor(cores) {
  return Number.isInteger(cores) && cores > 1 ? Math.min(MAX_THREADS, cores - 1) : 1;
}

class ClientWasmTransport extends EngineTransport {
  constructor({ leaseId, emit, limits = LIMITS, variant = 'single' }) {
    super();
    this.leaseId = leaseId;
    this._emit = emit;
    this.limits = limits;
    this.variant = variant === 'multi' ? 'multi' : 'single';
    this.threads = 1;
    this.ready = false;
    this.closed = false;
    this.inFlight = null;     // jobId
    this._count = 0;          // lines received for inFlight
    this._stopSent = false;
    this._hardSent = false;
    this._cbs = new Set();
  }

  /** info = engine:ready payload info (untrusted): only `cores` is read, and only for the multi build. */
  setReady(info = {}) {
    this.ready = true;
    if (this.variant === 'multi') this.threads = threadsFor(info && info.cores);
  }

  send(lines) {
    if (this.closed) throw new EngineError(ERR.NO_LEASE, this.leaseId);
    if (!this.ready) throw new EngineError(ERR.NOT_READY, this.leaseId);
    if (this.inFlight) throw new EngineError(ERR.BUSY, this.inFlight);
    const commands = groupCommands(lines);
    if (this.variant === 'multi') commands.unshift(`INFO THREAD_NUM ${this.threads}`);
    const jobId = crypto.randomUUID();
    this.inFlight = jobId;
    this._count = 0;
    this._stopSent = false;
    this._hardSent = false;
    this._emit('engine:job', { leaseId: this.leaseId, jobId, commands });
    return jobId;
  }

  onLine(cb) { this._cbs.add(cb); return () => this._cbs.delete(cb); }

  stop() {
    if (!this.inFlight || this.closed || this._stopSent) return;
    this._stopSent = true;
    if (this.variant === 'multi') this._emit('engine:stop', { leaseId: this.leaseId, jobId: this.inFlight, command: 'YXSTOP' });
    else this._hard();
  }

  /** After error/timeout: hard-stop the engine if needed, then forget the job so late lines are dropped. */
  reset() {
    if (this.inFlight && !this.closed && !this._hardSent) this._hard();
    this.inFlight = null;
    this._count = 0;
  }

  _hard() {
    this._hardSent = true;
    this._emit('engine:stop', { leaseId: this.leaseId, jobId: this.inFlight, hard: true });
  }

  /** Lease over. An in-flight job fails now (ENGINE_ERROR → caller's fallback) instead of waiting for its deadline. */
  close() {
    if (this.closed) return;
    const busy = !!this.inFlight;
    this.closed = true;
    this.inFlight = null;
    if (busy) this._fire('ERROR lease ended');
    this._cbs.clear();
  }

  /**
   * Client output. → 'ok' | 'stale' | ERR code (caller decides abuse handling). Never throws.
   * Lines are delivered in order; a bare move line inside a batch is NOT treated as final (only engine:done is).
   */
  deliverLines(jobId, lines) {
    if (this.closed || !jobId || jobId !== this.inFlight) return 'stale';
    if (!Array.isArray(lines) || lines.length > this.limits.linesPerBatch) return ERR.TOO_LARGE;
    if (this._count + lines.length > this.limits.linesPerJob) return ERR.TOO_LARGE;
    for (const l of lines) if (typeof l !== 'string' || l.length > this.limits.lineChars) return ERR.TOO_LARGE;
    this._count += lines.length;
    for (const l of lines) {
      if (MOVE_LINE.test(l.trim())) continue; // the move comes only via done(); never twice
      this._fire(l);
    }
    return 'ok';
  }

  /** Final move line for the job. Fed through the parser exactly once. */
  deliverDone(jobId, moveLine) {
    if (this.closed || !jobId || jobId !== this.inFlight) return 'stale';
    if (typeof moveLine !== 'string' || moveLine.length > this.limits.moveLineChars) return ERR.TOO_LARGE;
    const line = moveLine.trim();
    if (!MOVE_LINE.test(line)) return ERR.BAD_REQUEST;
    this.inFlight = null;
    this._fire(line);
    return 'ok';
  }

  /** Client-side failure (load error, crash) for the current job → surfaced as an engine ERROR line. */
  deliverError(jobId) {
    if (this.closed || !this.inFlight || (jobId && jobId !== this.inFlight)) return 'stale';
    this._fire('ERROR client engine failure');
    return 'ok';
  }

  _fire(line) { for (const cb of [...this._cbs]) cb(line); }
}

module.exports = { ClientWasmTransport, CLIENT_LIMITS: LIMITS, MOVE_LINE, groupCommands, threadsFor, ENGINE_MAX_THREADS: MAX_THREADS };
