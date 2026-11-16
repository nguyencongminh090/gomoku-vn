/**
 * #405 engine-host.js: relay only — lease request, gated fetch, worker lifecycle, batching, stop/end/disconnect.
 * @jest-environment jsdom
 */
'use strict';

const fs = require('fs');
const path = require('path');

function load() {
  const src = fs.readFileSync(path.join(__dirname, '../js/engine/engine-host.js'), 'utf8').replace(/^export /gm, '');
  return new Function(`${src}\nreturn { EngineHost, probeCapabilities, _clearFileCache, ENGINE_WORKER_URL, ENGINE_TOKEN_HEADER };`)();
}

class FakeSocket {
  constructor() { this.h = new Map(); this.sent = []; this.reply = null; }
  on(ev, fn) { (this.h.get(ev) || this.h.set(ev, new Set()).get(ev)).add(fn); }
  off(ev, fn) { const s = this.h.get(ev); if (s) s.delete(fn); }
  emit(ev, data, ack) {
    this.sent.push([ev, data]);
    if (ev === 'engine:request' && ack) setTimeout(() => ack(this.reply), 0);
  }
  server(ev, data) { for (const fn of [...(this.h.get(ev) || [])]) fn(data); }
  count(ev) { return [...(this.h.get(ev) || [])].length; }
  of(ev) { return this.sent.filter(([e]) => e === ev).map(([, d]) => d); }
}

let workers;
class FakeWorker {
  constructor(url) { this.url = url; this.posted = []; this.terminated = false; workers.push(this); }
  postMessage(m) { this.posted.push(m); }
  terminate() { this.terminated = true; }
  out(msg) { this.onmessage({ data: msg }); }
}

const GRANT = {
  ok: true, leaseId: 'L1', token: 'TOK', variant: 'single', base: '/engine/abcdef012345/',
  files: { js: 'rapfi-single-simd128.js', wasm: 'rapfi-single-simd128.wasm', data: 'rapfi-single-simd128.data' },
};
const flush = () => new Promise((r) => setTimeout(r, 0));

let M; let socket; let fetches; let host;
function makeHost(opts = {}) {
  fetches = [];
  const fetchImpl = async (url, init) => {
    fetches.push([url, init]);
    return { ok: true, status: 200, text: async () => `glue:${url}`, arrayBuffer: async () => new ArrayBuffer(4) };
  };
  return new M.EngineHost(socket, { WorkerCtor: FakeWorker, fetchImpl, flushMs: 10, probe: () => ({ wasm: true, simd: true }), ...opts });
}
async function startReady(h = host) {
  const before = workers.length;
  const p = h.start({ purpose: 'opponent', gameId: 'g1' });
  for (let i = 0; i < 20 && workers.length === before; i++) await flush();
  workers[workers.length - 1].out({ type: 'ready' });
  return p;
}

beforeEach(() => {
  M = load();
  M._clearFileCache();
  workers = [];
  socket = new FakeSocket();
  socket.reply = GRANT;
  host = makeHost();
});

describe('EngineHost.start', () => {
  test('request → 3 gated fetches (header token, stable URLs) → worker init with files → engine:ready', async () => {
    const r = await startReady();
    expect(r).toEqual({ ok: true, leaseId: 'L1' });
    expect(socket.of('engine:request')).toEqual([{ purpose: 'opponent', gameId: 'g1', variant: 'single' }]);
    expect(fetches.map(([u]) => u).sort()).toEqual([
      '/engine/abcdef012345/rapfi-single-simd128.data', '/engine/abcdef012345/rapfi-single-simd128.js', '/engine/abcdef012345/rapfi-single-simd128.wasm',
    ]);
    for (const [u, init] of fetches) {
      expect(u).not.toMatch(/TOK/);
      expect(init.headers[M.ENGINE_TOKEN_HEADER]).toBe('TOK');
    }
    expect(workers).toHaveLength(1);
    expect(workers[0].url).toBe(M.ENGINE_WORKER_URL);
    expect(M.ENGINE_WORKER_URL).toMatch(/^\/js\/engine\/engine\.worker\.js\?v=[0-9a-f]{8}$/);
    const init = workers[0].posted[0];
    expect(init).toMatchObject({ type: 'init', glue: 'glue:/engine/abcdef012345/rapfi-single-simd128.js', dataName: 'rapfi-single-simd128.data' });
    expect(init.wasm).toBeInstanceOf(ArrayBuffer);
    expect(socket.of('engine:ready')).toEqual([{ leaseId: 'L1', info: { variant: 'single', cores: navigator.hardwareConcurrency || 1 } }]);
    expect(host.state).toBe('ready');
  });

  test('no SIMD → refused locally, nothing sent', async () => {
    host = makeHost({ probe: () => ({ wasm: true, simd: false }) });
    expect(await host.start({ purpose: 'opponent' })).toEqual({ ok: false, code: 'ENGINE_UNSUPPORTED' });
    expect(socket.sent).toEqual([]);
  });

  test('server refusal → code passed through, host idle again, no listeners', async () => {
    socket.reply = { ok: false, code: 'ENGINE_FORBIDDEN' };
    expect(await host.start({ purpose: 'opponent' })).toEqual({ ok: false, code: 'ENGINE_FORBIDDEN' });
    expect(host.state).toBe('idle');
    expect(socket.count('engine:job')).toBe(0);
  });

  test('download fails → engine:error to server, disposed', async () => {
    host = makeHost({ fetchImpl: async () => ({ ok: false, status: 403 }) });
    expect(await host.start({ purpose: 'opponent' })).toEqual({ ok: false, code: 'ENGINE_LOAD_FAILED' });
    expect(socket.of('engine:error')).toEqual([{ leaseId: 'L1', code: 'ENGINE_LOAD_FAILED' }]);
    expect(host.state).toBe('ended');
    expect(socket.count('engine:job')).toBe(0);
  });

  test('worker load error → engine:error, worker terminated', async () => {
    const p = host.start({ purpose: 'opponent' });
    for (let i = 0; i < 20 && !workers.length; i++) await flush();
    workers[0].out({ type: 'error', text: 'wasm: CompileError' });
    expect(await p).toEqual({ ok: false, code: 'ENGINE_LOAD_FAILED' });
    expect(workers[0].terminated).toBe(true);
  });

  test('engine:end while loading → start resolves ENGINE_ENDED, no engine:ready', async () => {
    const p = host.start({ purpose: 'opponent' });
    for (let i = 0; i < 20 && !workers.length; i++) await flush();
    socket.server('engine:end', { leaseId: 'L1', reason: 'game_over' });
    expect(await p).toEqual({ ok: false, code: 'ENGINE_ENDED' });
    expect(socket.of('engine:ready')).toEqual([]);
    expect(workers[0].terminated).toBe(true);
  });

  test('second start while busy refused', async () => {
    await startReady();
    expect(await host.start({ purpose: 'opponent' })).toEqual({ ok: false, code: 'ENGINE_HOST_BUSY' });
  });
});

describe('job relay', () => {
  test('job commands → one worker cmd each, in order (blocks stay whole); output batched; move line flushes batch then engine:done', async () => {
    await startReady();
    const w = workers[0];
    w.out({ type: 'line', text: 'MESSAGE banner before job' }); // dropped: no job
    socket.server('engine:job', { leaseId: 'L1', jobId: 'J1', commands: ['INFO RULE 0', 'YXBOARD\n7,7,1\nDONE', 'YXNBEST 1'] });
    expect(w.posted.slice(1)).toEqual([
      { type: 'cmd', text: 'INFO RULE 0' }, { type: 'cmd', text: 'YXBOARD\n7,7,1\nDONE' }, { type: 'cmd', text: 'YXNBEST 1' },
    ]);
    w.out({ type: 'line', text: 'MESSAGE a' });
    w.out({ type: 'line', text: 'MESSAGE b' });
    expect(socket.of('engine:line')).toEqual([]); // still batching
    w.out({ type: 'line', text: '7,8' });
    expect(socket.of('engine:line')).toEqual([{ leaseId: 'L1', jobId: 'J1', lines: ['MESSAGE a', 'MESSAGE b'] }]);
    expect(socket.of('engine:done')).toEqual([{ leaseId: 'L1', jobId: 'J1', moveLine: '7,8' }]);
    w.out({ type: 'line', text: 'MESSAGE after' });
    await new Promise((r) => setTimeout(r, 20));
    expect(socket.of('engine:line')).toHaveLength(1);
  });

  test('timer flush and 256-line cap', async () => {
    await startReady();
    const w = workers[0];
    socket.server('engine:job', { leaseId: 'L1', jobId: 'J1', commands: ['X'] });
    w.out({ type: 'line', text: 'MESSAGE t' });
    await new Promise((r) => setTimeout(r, 20));
    expect(socket.of('engine:line')).toEqual([{ leaseId: 'L1', jobId: 'J1', lines: ['MESSAGE t'] }]);
    for (let i = 0; i < 256; i++) w.out({ type: 'line', text: `MESSAGE ${i}` });
    expect(socket.of('engine:line')[1].lines).toHaveLength(256);
  });

  test('events for another lease ignored', async () => {
    await startReady();
    socket.server('engine:job', { leaseId: 'OTHER', jobId: 'J', commands: ['X'] });
    socket.server('engine:end', { leaseId: 'OTHER' });
    expect(workers[0].posted).toHaveLength(1);
    expect(host.state).toBe('ready');
  });

  test('engine:stop → worker terminated, fresh worker from cached files (no refetch), old output dropped', async () => {
    await startReady();
    socket.server('engine:job', { leaseId: 'L1', jobId: 'J1', commands: ['X'] });
    const old = workers[0];
    socket.server('engine:stop', { leaseId: 'L1', jobId: 'J1' });
    expect(old.terminated).toBe(true);
    expect(workers).toHaveLength(2);
    expect(workers[1].posted[0].type).toBe('init');
    expect(fetches).toHaveLength(3);
    old.out({ type: 'line', text: '1,1' });
    expect(socket.of('engine:done')).toEqual([]);
    workers[1].out({ type: 'ready' });
    socket.server('engine:job', { leaseId: 'L1', jobId: 'J2', commands: ['Y'] });
    workers[1].out({ type: 'line', text: '2,2' });
    expect(socket.of('engine:done')).toEqual([{ leaseId: 'L1', jobId: 'J2', moveLine: '2,2' }]);
  });

  test('stop for a job that is not current is ignored', async () => {
    await startReady();
    socket.server('engine:job', { leaseId: 'L1', jobId: 'J2', commands: ['X'] });
    socket.server('engine:stop', { leaseId: 'L1', jobId: 'J1' });
    expect(workers).toHaveLength(1);
  });

  test('worker crash mid-job → engine:error with jobId, respawn', async () => {
    await startReady();
    socket.server('engine:job', { leaseId: 'L1', jobId: 'J1', commands: ['X'] });
    workers[0].out({ type: 'exit', code: 1 });
    expect(socket.of('engine:error')).toEqual([{ leaseId: 'L1', jobId: 'J1', code: 'ENGINE_CLIENT_CRASH' }]);
    expect(workers).toHaveLength(2);
  });
});

describe('teardown', () => {
  test('engine:end → worker terminated, listeners removed, state ended', async () => {
    await startReady();
    socket.server('engine:end', { leaseId: 'L1', reason: 'game_over' });
    expect(workers[0].terminated).toBe(true);
    expect(host.state).toBe('ended');
    for (const ev of ['engine:job', 'engine:stop', 'engine:end', 'disconnect']) expect(socket.count(ev)).toBe(0);
  });

  test('disconnect → disposed; start() after reconnect works and reuses cached files', async () => {
    await startReady();
    socket.server('disconnect');
    expect(workers[0].terminated).toBe(true);
    expect(host.state).toBe('ended');
    socket.reply = { ...GRANT, leaseId: 'L2', token: 'TOK2' };
    const r = await startReady();
    expect(r).toEqual({ ok: true, leaseId: 'L2' });
    expect(fetches).toHaveLength(3); // no second download
    expect(socket.of('engine:ready').pop()).toMatchObject({ leaseId: 'L2', info: { variant: 'single' } });
  });
});

describe('probeCapabilities', () => {
  test('no WebAssembly → unsupported; validate result passed through', () => {
    const plain = {};
    expect(M.probeCapabilities(null)).toEqual({ wasm: false, simd: false, threads: false });
    expect(M.probeCapabilities({ validate: () => true }, plain)).toEqual({ wasm: true, simd: true, threads: false });
    expect(M.probeCapabilities({ validate: () => false }, plain)).toEqual({ wasm: true, simd: false, threads: false });
    expect(M.probeCapabilities({ validate: () => { throw new Error('x'); } }, plain)).toEqual({ wasm: true, simd: false, threads: false });
  });

  test('threads only on a cross-origin isolated page with SharedArrayBuffer (#408)', () => {
    const v = { validate: () => true };
    expect(M.probeCapabilities(v, { crossOriginIsolated: true, SharedArrayBuffer: function SAB() {} }).threads).toBe(true);
    expect(M.probeCapabilities(v, { crossOriginIsolated: false, SharedArrayBuffer: function SAB() {} }).threads).toBe(false);
    expect(M.probeCapabilities(v, { crossOriginIsolated: true }).threads).toBe(false);
  });
});

describe('multi-thread variant (#408)', () => {
  const threadsProbe = () => ({ wasm: true, simd: true, threads: true });

  test('isolated page asks multi; granted → worker init variant multi, ready reports cores', async () => {
    host = makeHost({ probe: threadsProbe });
    socket.reply = { ...GRANT, variant: 'multi', files: { js: 'rapfi-multi-simd128.js', wasm: 'rapfi-multi-simd128.wasm', data: 'rapfi-multi-simd128.data' } };
    await startReady();
    expect(socket.of('engine:request')[0].variant).toBe('multi');
    expect(workers[0].posted[0]).toMatchObject({ type: 'init', variant: 'multi', dataName: 'rapfi-multi-simd128.data' });
    expect(socket.of('engine:ready')[0].info).toMatchObject({ variant: 'multi', cores: expect.any(Number) });
  });

  test('server downgrades to single → host runs single', async () => {
    host = makeHost({ probe: threadsProbe });
    await startReady();
    expect(host.variant).toBe('single');
    expect(workers[0].posted[0].variant).toBe('single');
  });

  test('non-isolated page asks single', async () => {
    await startReady();
    expect(socket.of('engine:request')[0].variant).toBe('single');
  });

  test('stop with a command → forwarded to the worker, no respawn, move still relayed as done', async () => {
    host = makeHost({ probe: threadsProbe });
    socket.reply = { ...GRANT, variant: 'multi' };
    await startReady();
    socket.server('engine:job', { leaseId: 'L1', jobId: 'J1', commands: ['YXNBEST 1'] });
    socket.server('engine:stop', { leaseId: 'L1', jobId: 'J1', command: 'YXSTOP' });
    expect(workers).toHaveLength(1);
    expect(workers[0].posted.pop()).toEqual({ type: 'cmd', text: 'YXSTOP' });
    workers[0].out({ type: 'line', text: '4,4' });
    expect(socket.of('engine:done')).toEqual([{ leaseId: 'L1', jobId: 'J1', moveLine: '4,4' }]);
  });

  test('hard stop wins over a command → respawn', async () => {
    host = makeHost({ probe: threadsProbe });
    socket.reply = { ...GRANT, variant: 'multi' };
    await startReady();
    socket.server('engine:job', { leaseId: 'L1', jobId: 'J1', commands: ['YXNBEST 1'] });
    socket.server('engine:stop', { leaseId: 'L1', jobId: 'J1', command: 'YXSTOP', hard: true });
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);
  });
});
