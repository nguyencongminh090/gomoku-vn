'use strict';
const { EventEmitter } = require('events');
const { JobFactory } = require('./Job');
const { EngineOutputParser } = require('./EngineOutputParser');
const { defaultRegistry } = require('./purposes');
const { isZoneFirstMove } = require('./RuleMapper');
const { ERR, EngineError } = require('./constants');

const STOP_GRACE_MS = 1500;
const PROGRESS_KINDS = new Set(['pv', 'progress', 'realtime']);

/**
 * Facade: submit(purpose, input) for every use (bot move, analysis, puzzle verify, hint).
 * One job in flight per transport; later submits for the same `slot` supersede earlier ones (stale-drop by job key).
 * Events: 'progress' {job, event}, 'job:done' {job, ms}, 'job:error' {job, error}.
 */
class EngineService extends EventEmitter {
  constructor({ transport, purposes = defaultRegistry(), stopGraceMs = STOP_GRACE_MS } = {}) {
    super();
    this.transport = transport;
    this.purposes = purposes;
    this.stopGraceMs = stopGraceMs;
    this._tail = Promise.resolve();
    this._slotKey = new Map();
  }

  _purpose(name) {
    const p = this.purposes.get(name);
    if (!p) throw new EngineError(ERR.UNKNOWN_PURPOSE, String(name));
    return p;
  }

  /** → { ok:true, result, job } | { ok:false, code, job? }. Throws only on caller bugs (bad state / unknown purpose / forbidden). */
  async submit(purposeName, input, { slot = 'default', blocked = [] } = {}) {
    const purpose = this._purpose(purposeName);
    const job = JobFactory.create(purpose, input, { blocked });
    this._slotKey.set(slot, job.key);
    const run = this._tail.then(() => this._execute(purpose, job, slot));
    this._tail = run.catch(() => {});
    return run;
  }

  async _execute(purpose, job, slot) {
    if (this._slotKey.get(slot) !== job.key) return { ok: false, code: ERR.STALE, job };
    const t0 = Date.now();
    try {
      const events = await this._run(job);
      if (this._slotKey.get(slot) !== job.key) return { ok: false, code: ERR.STALE, job };
      const result = purpose.parse(events, { ...job.ctx, stm: job.stm });
      this.emit('job:done', { job, ms: Date.now() - t0 });
      return { ok: true, result, job };
    } catch (e) {
      const error = e instanceof EngineError ? e : new EngineError(ERR.ENGINE_ERROR, e && e.message);
      try { this.transport.reset(); } catch (_) { /* transport owns recovery */ }
      this.emit('job:error', { job, error });
      return { ok: false, code: error.code, job };
    }
  }

  _run(job) {
    return new Promise((resolve, reject) => {
      const parser = new EngineOutputParser();
      const events = [];
      let done = false;
      let stopTimer = null; let killTimer = null; let off = () => {};
      const finish = (fn, v) => {
        if (done) return;
        done = true; clearTimeout(stopTimer); clearTimeout(killTimer); off(); fn(v);
      };
      off = this.transport.onLine((line) => {
        for (const ev of parser.feed(line)) {
          events.push(ev);
          if (PROGRESS_KINDS.has(ev.kind)) this.emit('progress', { job, event: ev });
          if (ev.kind === 'error') {
            const code = /^Unknown command/i.test(ev.text) ? ERR.DESYNC : ERR.ENGINE_ERROR;
            return finish(reject, new EngineError(code, ev.text));
          }
          if (ev.kind === 'move') return finish(resolve, events);
        }
        return undefined;
      });
      stopTimer = setTimeout(() => {
        this.transport.stop();
        killTimer = setTimeout(() => finish(reject, new EngineError(ERR.TIMEOUT, job.purpose)), this.stopGraceMs);
      }, job.deadlineMs);
      try { this.transport.send(job.lines); } catch (e) { finish(reject, e); }
    });
  }

  /**
   * Bot move. `validate(x,y)` = the caller's authority (GameEngine.makeMove): returns an object with `error`
   * when illegal; on success the move IS applied. Illegal engine move → one retry with that cell blocked →
   * deterministic fallback (centre-out) so the game never stalls.
   * → { ok, move, source: 'engine'|'zone'|'fallback', attempts, reason? } | { ok:false, code }
   */
  async playOpponent(input, validate, { slot = 'default' } = {}) {
    const blocked = [];
    let reason = null;
    let attempts = 0;
    // The engine cannot be confined to firstMoveZones: YXBLOCK-ing every other cell empties its root-move
    // list and it then falls back to ALL candidates (searchengine.cpp), so the zone is chosen server-side.
    if (isZoneFirstMove(input.state)) {
      for (const c of fallbackCandidates(input.state)) {
        const v = validate(c.x, c.y);
        if (!v || !v.error) return { ok: true, move: c, source: 'zone', attempts: 0 };
      }
      return { ok: false, code: ERR.NO_LEGAL_MOVE, attempts: 0 };
    }
    for (; attempts < 2; ) {
      attempts++;
      const r = await this.submit('opponent', input, { slot, blocked });
      if (!r.ok) { reason = r.code; break; }
      const mv = r.result.move;
      if (!mv) { reason = ERR.ENGINE_ERROR; break; }
      const v = validate(mv.x, mv.y);
      if (!v || !v.error) return { ok: true, move: mv, source: 'engine', attempts };
      reason = v.code || 'REJECTED';
      blocked.push({ x: mv.x, y: mv.y });
    }
    for (const c of fallbackCandidates(input.state)) {
      const v = validate(c.x, c.y);
      if (!v || !v.error) return { ok: true, move: c, source: 'fallback', attempts, reason };
    }
    return { ok: false, code: ERR.NO_LEGAL_MOVE, attempts, reason };
  }

  close() { this.transport.close(); }
}

/** Empty, playable cells ordered centre-out; first move restricted to firstMoveZones on wall boards. */
function fallbackCandidates(state) {
  const n = state.boardSize;
  const taken = new Set();
  for (const w of state.walls || []) taken.add(`${w.x},${w.y}`);
  for (const p of state.portals || []) { taken.add(`${p.a.x},${p.a.y}`); taken.add(`${p.b.x},${p.b.y}`); }
  for (const m of state.moves || []) taken.add(`${m.x},${m.y}`);
  const zone = (state.walls || []).length && (state.moves || []).length === 0 && (state.firstMoveZones || []).length
    ? new Set(state.firstMoveZones.map((z) => `${z.x},${z.y}`)) : null;
  const c = (n - 1) / 2;
  const out = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const k = `${x},${y}`;
      if (taken.has(k) || (zone && !zone.has(k))) continue;
      out.push({ x, y, d: Math.max(Math.abs(x - c), Math.abs(y - c)), t: Math.abs(x - c) + Math.abs(y - c) });
    }
  }
  return out.sort((a, b) => a.d - b.d || a.t - b.t || a.y - b.y || a.x - b.x).map(({ x, y }) => ({ x, y }));
}

module.exports = { EngineService, fallbackCandidates };
