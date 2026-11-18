// engine-host.js — browser side of the client-hosted engine (#405, features/rapfi-engine/backend-design.md §3–§4).
// A dumb relay: no protocol logic. The server builds every command line and parses every result.
//   start({purpose, gameId}) → engine:request → fetch lease-gated files → worker → engine:ready
//   engine:job  → each command to the worker (server-grouped);  worker output → engine:line batches + engine:done (bare move line)
//   engine:stop → {command}: pass it on (multi build, YXSTOP; the move still comes) | {hard}: terminate + respawn
//   engine:end / disconnect → dispose.  Multi-thread build (#408) only on a cross-origin isolated page.
export const ENGINE_WORKER_URL = '/js/engine/engine.worker.js?v=43ca8712';
export const ENGINE_TOKEN_HEADER = 'X-Engine-Token';
const MOVE_LINE = /^(\d{1,2},\d{1,2}( \d{1,2},\d{1,2})*|SWAP)$/;
const MAX_BATCH = 256; // = server CLIENT_LIMITS.linesPerBatch
const REQUEST_TIMEOUT_MS = 15000;
const LOAD_TIMEOUT_MS = 90000;

// Smallest module using a v128 op: validates only where WASM SIMD is supported.
const SIMD_PROBE = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);

/** → { wasm, simd, threads }. threads = the multi build can run here (SharedArrayBuffer on an isolated page). */
export function probeCapabilities(WA = globalThis.WebAssembly, g = globalThis) {
  if (!WA || typeof WA.validate !== 'function') return { wasm: false, simd: false, threads: false };
  let simd = false;
  try { simd = WA.validate(SIMD_PROBE); } catch (_) { simd = false; }
  const threads = !!(g && g.crossOriginIsolated === true && typeof g.SharedArrayBuffer === 'function');
  return { wasm: true, simd, threads };
}

// Engine files per URL for the life of the page: a respawn or a new lease never refetches.
const fileCache = new Map();

export class EngineHost {
  constructor(socket, opts = {}) {
    this.socket = socket;
    this.WorkerCtor = opts.WorkerCtor || globalThis.Worker;
    this.fetchImpl = opts.fetchImpl || ((...a) => globalThis.fetch(...a));
    this.workerUrl = opts.workerUrl || ENGINE_WORKER_URL;
    this.flushMs = opts.flushMs ?? 100;
    this.probe = opts.probe || probeCapabilities;
    this.onState = opts.onState || (() => {});
    this.state = 'idle';
    this.variant = null;
    this.leaseId = null;
    this.jobId = null;
    this.worker = null;
    this._files = null;
    this._batch = [];
    this._flushTimer = null;
    this._handlers = null;
  }

  _set(state) { this.state = state; this.onState(state); }

  /** → { ok:true, leaseId } | { ok:false, code } */
  async start({ purpose, gameId = null }) {
    if (this.state !== 'idle' && this.state !== 'ended') return { ok: false, code: 'ENGINE_HOST_BUSY' };
    const caps = this.probe();
    if (!caps.wasm || !caps.simd) return { ok: false, code: 'ENGINE_UNSUPPORTED' };
    this._set('requesting');
    const grant = await this._request({ purpose, gameId, variant: caps.threads ? 'multi' : 'single' });
    if (!grant || !grant.ok) { this._set('idle'); return { ok: false, code: (grant && grant.code) || 'ENGINE_REQUEST_FAILED' }; }
    this.leaseId = grant.leaseId;
    this.variant = grant.variant === 'multi' && caps.threads ? 'multi' : 'single'; // the server may downgrade
    this._listen();
    this._set('loading');
    try {
      this._files = await this._fetchFiles(grant);
      await this._spawn();
    } catch (e) {
      if (this.leaseId !== grant.leaseId) return { ok: false, code: 'ENGINE_ENDED' };
      this.socket.emit('engine:error', { leaseId: grant.leaseId, code: 'ENGINE_LOAD_FAILED' });
      this.dispose();
      return { ok: false, code: 'ENGINE_LOAD_FAILED' };
    }
    if (this.leaseId !== grant.leaseId) return { ok: false, code: 'ENGINE_ENDED' }; // ended while loading
    const cores = (globalThis.navigator && globalThis.navigator.hardwareConcurrency) || 1;
    this.socket.emit('engine:ready', { leaseId: this.leaseId, info: { variant: this.variant, cores } });
    this._set('ready');
    return { ok: true, leaseId: this.leaseId };
  }

  _request(payload) {
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve({ ok: false, code: 'ENGINE_REQUEST_TIMEOUT' }), REQUEST_TIMEOUT_MS);
      this.socket.emit('engine:request', payload, (res) => { clearTimeout(t); resolve(res); });
    });
  }

  async _fetchFiles(grant) {
    const get = async (name, kind) => {
      const url = grant.base + name;
      if (fileCache.has(url)) return fileCache.get(url);
      const res = await this.fetchImpl(url, { headers: { [ENGINE_TOKEN_HEADER]: grant.token }, credentials: 'same-origin' });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${name}`);
      const body = kind === 'text' ? await res.text() : await res.arrayBuffer();
      fileCache.set(url, body);
      return body;
    };
    const f = grant.files;
    const [glue, wasm, data] = await Promise.all([get(f.js, 'text'), get(f.wasm, 'bin'), get(f.data, 'bin')]);
    return { glue, wasm, data, dataName: f.data };
  }

  /** New worker from the cached files. Resolves on its 'ready'. */
  _spawn() {
    this._kill();
    const w = new this.WorkerCtor(this.workerUrl);
    this.worker = w;
    return new Promise((resolve, reject) => {
      let settled = false;
      const t = setTimeout(() => { if (!settled && w === this.worker) { settled = true; reject(new Error('load timeout')); } }, LOAD_TIMEOUT_MS);
      // Replaced/terminated before 'ready': settle as cancelled so nobody waits forever.
      this._cancelSpawn = () => {
        if (settled) return;
        settled = true; clearTimeout(t);
        reject(Object.assign(new Error('cancelled'), { cancelled: true }));
      };
      w.onmessage = (e) => {
        if (w !== this.worker) return;
        const msg = e.data || {};
        if (msg.type === 'ready') { if (!settled) { settled = true; clearTimeout(t); resolve(); } }
        else if (msg.type === 'line') this._onLine(String(msg.text));
        else if (msg.type === 'error' || msg.type === 'exit') {
          if (!settled) { settled = true; clearTimeout(t); reject(new Error(msg.text || 'exit')); } else this._crash();
        }
      };
      w.onerror = () => {
        if (w !== this.worker) return;
        if (!settled) { settled = true; clearTimeout(t); reject(new Error('worker error')); } else this._crash();
      };
      w.postMessage({ type: 'init', variant: this.variant, ...this._files });
    });
  }

  _kill() {
    if (this._cancelSpawn) { this._cancelSpawn(); this._cancelSpawn = null; }
    if (this.worker) { try { this.worker.terminate(); } catch (_) { /* gone */ } }
    this.worker = null;
  }

  _crash() {
    if (!this.leaseId) return;
    this.socket.emit('engine:error', { leaseId: this.leaseId, jobId: this.jobId, code: 'ENGINE_CLIENT_CRASH' });
    this.jobId = null;
    this._batch = [];
    this._respawn();
  }

  _respawn() {
    this._spawn().catch((e) => {
      if (e && e.cancelled) return;
      if (!this.leaseId) return;
      this.socket.emit('engine:error', { leaseId: this.leaseId, code: 'ENGINE_LOAD_FAILED' });
      this.dispose();
    });
  }

  _onLine(text) {
    if (!this.jobId) return; // startup banners, output of a stopped job
    const line = text.trim();
    if (!line) return;
    if (MOVE_LINE.test(line)) {
      this._flush();
      const jobId = this.jobId;
      this.jobId = null;
      this.socket.emit('engine:done', { leaseId: this.leaseId, jobId, moveLine: line });
      return;
    }
    this._batch.push(line);
    if (this._batch.length >= MAX_BATCH) this._flush();
    else if (!this._flushTimer) this._flushTimer = setTimeout(() => this._flush(), this.flushMs);
  }

  _flush() {
    clearTimeout(this._flushTimer);
    this._flushTimer = null;
    if (!this._batch.length || !this.jobId) { this._batch = []; return; }
    const lines = this._batch;
    this._batch = [];
    this.socket.emit('engine:line', { leaseId: this.leaseId, jobId: this.jobId, lines });
  }

  _listen() {
    const mine = (p) => p && p.leaseId === this.leaseId;
    this._handlers = {
      'engine:job': (p) => {
        if (!mine(p) || !Array.isArray(p.commands) || !this.worker) return;
        this._flush();
        this.jobId = p.jobId;
        // One postMessage = one sendCommand(); the server already grouped multi-line blocks.
        for (const text of p.commands) this.worker.postMessage({ type: 'cmd', text: String(text) });
      },
      'engine:stop': (p) => {
        if (!mine(p) || p.jobId !== this.jobId) return;
        if (!p.hard && typeof p.command === 'string' && this.worker) {
          this.worker.postMessage({ type: 'cmd', text: p.command }); // job stays current: its move line follows
          return;
        }
        this.jobId = null;
        this._batch = [];
        clearTimeout(this._flushTimer); this._flushTimer = null;
        this._respawn();
      },
      'engine:end': (p) => { if (mine(p)) this.dispose(); },
      disconnect: () => this.dispose(), // the server ended the lease with the socket; start() again after reconnect
    };
    for (const [ev, fn] of Object.entries(this._handlers)) this.socket.on(ev, fn);
  }

  /** Terminate the worker and forget the lease. Safe to call repeatedly. */
  dispose() {
    if (this._handlers) {
      for (const [ev, fn] of Object.entries(this._handlers)) this.socket.off(ev, fn);
      this._handlers = null;
    }
    clearTimeout(this._flushTimer); this._flushTimer = null;
    this._batch = [];
    this._kill();
    this.leaseId = null;
    this.jobId = null;
    if (this.state !== 'idle') this._set('ended');
  }
}

/** Test seam. */
export function _clearFileCache() { fileCache.clear(); }
