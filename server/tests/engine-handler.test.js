'use strict';
/** #405: EngineHandler socket protocol + /engine file route. Fake sockets; temp build dir (never the real one). */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const { EventEmitter } = require('events');
const EngineHandler = require('../socket/handlers/EngineHandler');
const { LeaseManager } = require('../engine/LeaseManager');
const { createEngineFilesRouter } = require('../routes/engine-files');

const BUILD = 'abcdef012345';
let dir;
beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-files-'));
  fs.mkdirSync(path.join(dir, BUILD));
  for (const ext of ['js', 'wasm', 'data']) fs.writeFileSync(path.join(dir, BUILD, `rapfi-single-simd128.${ext}`), `${ext}-bytes`);
  fs.writeFileSync(path.join(dir, BUILD, 'secret.txt'), 'nope');
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

let n = 0;
function fakeSocket(userId = 'u1') {
  const s = new EventEmitter();
  const serverOn = s.on.bind(s);
  s.id = `sock-${++n}`;
  s.user = { userId, displayName: userId, isGuest: false };
  s.connected = true;
  s.sent = [];
  s.on = serverOn;
  s.emit = (ev, data) => { s.sent.push([ev, data]); return true; };
  s.client = (ev, ...args) => EventEmitter.prototype.emit.call(s, ev, ...args); // client → server
  s.request = (p) => new Promise((r) => s.client('engine:request', p, r));
  s.last = (ev) => s.sent.filter(([e]) => e === ev).map(([, d]) => d).pop();
  EngineHandler.register(null, s);
  return s;
}
const tick = () => new Promise((r) => setImmediate(r));
const base = () => ({ boardSize: 15, winningRule: 'freestyle', walls: [], portals: [], firstMoveZones: [], moves: [{ x: 7, y: 7 }] });

let clock;
beforeEach(() => {
  EngineHandler._reset();
  clock = { t: 5_000_000 };
  EngineHandler._configure({
    enabled: true,
    buildOpts: { dir },
    serviceOpts: { stopGraceMs: 20 },
    leases: new LeaseManager({ secret: 's', now: () => clock.t, readyTimeoutMs: 1000, idleTtlMs: 5000 }),
  });
  EngineHandler.setAuthorizer(() => true);
});
afterAll(() => EngineHandler._reset());

describe('engine:request', () => {
  test('grant: lease id, token, stable build base + file names, single variant', async () => {
    const s = fakeSocket();
    const r = await s.request({ purpose: 'analysis', gameId: 'g1' });
    expect(r).toMatchObject({ ok: true, variant: 'single', base: `/engine/${BUILD}/` });
    expect(r.files).toEqual({ js: 'rapfi-single-simd128.js', wasm: 'rapfi-single-simd128.wasm', data: 'rapfi-single-simd128.data' });
    expect(EngineHandler.getLeaseManager().verifyToken(r.token).id).toBe(r.leaseId);
  });

  test.each([
    ['disabled', () => EngineHandler._configure({ enabled: false }), { purpose: 'analysis' }, 'ENGINE_DISABLED'],
    ['no authorizer', () => EngineHandler.setAuthorizer(null), { purpose: 'analysis' }, 'ENGINE_FORBIDDEN'],
    ['authorizer code', () => EngineHandler.setAuthorizer(async () => 'ENGINE_HINT_FORBIDDEN'), { purpose: 'hint' }, 'ENGINE_HINT_FORBIDDEN'],
    ['authorizer false', () => EngineHandler.setAuthorizer(() => false), { purpose: 'hint' }, 'ENGINE_FORBIDDEN'],
    ['unknown purpose', () => {}, { purpose: 'mine-bitcoin' }, 'ENGINE_UNKNOWN_PURPOSE'],
    ['unknown variant', () => {}, { purpose: 'analysis', variant: 'gpu' }, 'ENGINE_BAD_REQUEST'],
    ['no build', () => EngineHandler._configure({ buildOpts: { dir: path.join(dir, 'none') } }), { purpose: 'analysis' }, 'ENGINE_NO_BUILD'],
  ])('refused: %s', async (_n, setup, payload, code) => {
    setup();
    const s = fakeSocket();
    expect(await s.request(payload)).toEqual({ ok: false, code });
  });

  test('multi asked, build has no multi → downgraded to single (#408)', async () => {
    const r = await fakeSocket().request({ purpose: 'analysis', variant: 'multi' });
    expect(r).toMatchObject({ ok: true, variant: 'single', files: { wasm: 'rapfi-single-simd128.wasm' } });
  });

  test('multi asked and built → multi files; threads from engine:ready cores reach the job (#408)', async () => {
    for (const ext of ['js', 'wasm', 'data']) fs.writeFileSync(path.join(dir, BUILD, `rapfi-multi-simd128.${ext}`), `m-${ext}`);
    EngineHandler._configure({ buildOpts: { dir } });
    try {
      const s = fakeSocket();
      const r = await s.request({ purpose: 'hint', variant: 'multi' });
      expect(r).toMatchObject({ ok: true, variant: 'multi', files: { js: 'rapfi-multi-simd128.js', wasm: 'rapfi-multi-simd128.wasm', data: 'rapfi-multi-simd128.data' } });
      const single = await fakeSocket('u9').request({ purpose: 'hint' });
      expect(single.variant).toBe('single');
      s.client('engine:ready', { leaseId: r.leaseId, info: { cores: 6 } });
      EngineHandler.getService(r.leaseId).submit('hint', { state: base() });
      await tick();
      expect(s.last('engine:job').commands[0]).toBe('INFO THREAD_NUM 5');
    } finally {
      for (const ext of ['js', 'wasm', 'data']) fs.rmSync(path.join(dir, BUILD, `rapfi-multi-simd128.${ext}`));
      EngineHandler._configure({ buildOpts: { dir } });
    }
  });

  test('authorizer sees user, purpose, gameId', async () => {
    const seen = [];
    EngineHandler.setAuthorizer((a) => { seen.push([a.user.userId, a.purpose, a.gameId]); return true; });
    await fakeSocket('bob').request({ purpose: 'opponent', gameId: 42 });
    expect(seen).toEqual([['bob', 'opponent', '42']]);
  });

  test('rate limit: 7th request in a minute refused', async () => {
    const s = fakeSocket();
    for (let i = 0; i < 6; i++) expect((await s.request({ purpose: 'analysis' })).ok).toBe(true);
    expect(await s.request({ purpose: 'analysis' })).toEqual({ ok: false, code: 'ENGINE_RATE_LIMITED' });
  });

  test('re-request replaces: old lease gets engine:end replaced', async () => {
    const s = fakeSocket();
    const a = await s.request({ purpose: 'analysis' });
    const b = await s.request({ purpose: 'analysis' });
    expect(s.last('engine:end')).toEqual({ leaseId: a.leaseId, reason: 'replaced' });
    expect(EngineHandler.getService(a.leaseId)).toBeNull();
    expect(EngineHandler.getService(b.leaseId)).not.toBeNull();
  });
});

async function readyLease(s, purpose = 'hint', gameId = 'g1') {
  const r = await s.request({ purpose, gameId });
  s.client('engine:ready', { leaseId: r.leaseId });
  return r.leaseId;
}

describe('job flow', () => {
  test('ready hook → job → line/done → result; jobs refused before ready', async () => {
    const hooks = [];
    const off = EngineHandler.onLeaseReady((x) => hooks.push(x.leaseId));
    const s = fakeSocket();
    const r = await s.request({ purpose: 'hint', gameId: 'g1' });
    const early = await EngineHandler.getService(r.leaseId).submit('hint', { state: base() });
    expect(early).toMatchObject({ ok: false, code: 'ENGINE_NOT_READY' });
    s.client('engine:ready', { leaseId: r.leaseId });
    expect(hooks).toEqual([r.leaseId]);
    off();
    const p = EngineHandler.getService(r.leaseId).submit('hint', { state: base() });
    await tick();
    const job = s.last('engine:job');
    expect(job.leaseId).toBe(r.leaseId);
    s.client('engine:line', { leaseId: r.leaseId, jobId: job.jobId, lines: ['MESSAGE thinking'] });
    s.client('engine:done', { leaseId: r.leaseId, jobId: job.jobId, moveLine: '8,8' });
    expect(await p).toMatchObject({ ok: true, result: { move: { x: 8, y: 8 } } });
  });

  test('foreign socket cannot ready, answer or error another user\'s lease', async () => {
    const owner = fakeSocket('u1');
    const thief = fakeSocket('u2');
    const r = await owner.request({ purpose: 'hint', gameId: 'g1' });
    thief.client('engine:ready', { leaseId: r.leaseId });
    const early = await EngineHandler.getService(r.leaseId).submit('hint', { state: base() });
    expect(early.code).toBe('ENGINE_NOT_READY');
    owner.client('engine:ready', { leaseId: r.leaseId });
    const p = EngineHandler.getService(r.leaseId).submit('hint', { state: base() });
    await tick();
    const job = owner.last('engine:job');
    thief.client('engine:done', { leaseId: r.leaseId, jobId: job.jobId, moveLine: '0,0' });
    thief.client('engine:error', { leaseId: r.leaseId, jobId: job.jobId });
    owner.client('engine:done', { leaseId: r.leaseId, jobId: job.jobId, moveLine: '9,9' });
    expect((await p).result.move).toEqual({ x: 9, y: 9 });
    expect(thief.sent.filter(([e]) => e.startsWith('engine:job'))).toEqual([]);
  });

  test('stale job: output for a previous jobId is dropped', async () => {
    const s = fakeSocket();
    const id = await readyLease(s);
    const svc = EngineHandler.getService(id);
    const p1 = svc.submit('hint', { state: base() });
    await tick();
    const j1 = s.last('engine:job');
    s.client('engine:done', { leaseId: id, jobId: j1.jobId, moveLine: '1,1' });
    await p1;
    const p2 = svc.submit('hint', { state: base() });
    await tick();
    const j2 = s.last('engine:job');
    s.client('engine:done', { leaseId: id, jobId: j1.jobId, moveLine: '2,2' }); // late duplicate of job 1
    s.client('engine:done', { leaseId: id, jobId: j2.jobId, moveLine: '3,3' });
    expect((await p2).result.move).toEqual({ x: 3, y: 3 });
  });

  test('repeated silence: 2 consecutive timeouts end the lease (slow)', async () => {
    const s = fakeSocket();
    const id = await readyLease(s, 'opponent');
    const svc = EngineHandler.getService(id);
    const opp = { state: base(), difficulty: 'easy', clockMs: 5 };
    expect((await svc.submit('opponent', opp)).code).toBe('ENGINE_TIMEOUT');
    expect(EngineHandler.getService(id)).not.toBeNull();
    expect((await svc.submit('opponent', opp)).code).toBe('ENGINE_TIMEOUT');
    expect(EngineHandler.getService(id)).toBeNull();
    expect(s.last('engine:end')).toEqual({ leaseId: id, reason: 'slow' });
  });

  test('3 oversize payloads end the lease (abuse)', async () => {
    const s = fakeSocket();
    const id = await readyLease(s);
    EngineHandler.getService(id).submit('hint', { state: base() });
    await tick();
    const job = s.last('engine:job');
    for (let i = 0; i < 3; i++) s.client('engine:line', { leaseId: id, jobId: job.jobId, lines: new Array(257).fill('x') });
    expect(s.last('engine:end')).toEqual({ leaseId: id, reason: 'abuse' });
  });

  test('rate: 30 line batches then done → move still delivered (done is not rate-limited)', async () => {
    const s = fakeSocket();
    const id = await readyLease(s);
    const p = EngineHandler.getService(id).submit('hint', { state: base() });
    await tick();
    const job = s.last('engine:job');
    for (let i = 0; i < 30; i++) s.client('engine:line', { leaseId: id, jobId: job.jobId, lines: ['MESSAGE x'] });
    s.client('engine:done', { leaseId: id, jobId: job.jobId, moveLine: '5,5' });
    expect(await p).toMatchObject({ ok: true, result: { move: { x: 5, y: 5 } } });
  });

  test('rate exceeded → the job fails explicitly (no silently dropped batch), lease survives one strike', async () => {
    const s = fakeSocket();
    const id = await readyLease(s);
    const p = EngineHandler.getService(id).submit('hint', { state: base() });
    await tick();
    const job = s.last('engine:job');
    for (let i = 0; i < 31; i++) s.client('engine:line', { leaseId: id, jobId: job.jobId, lines: ['MESSAGE x'] });
    s.client('engine:done', { leaseId: id, jobId: job.jobId, moveLine: '5,5' });
    expect(await p).toMatchObject({ ok: false, code: 'ENGINE_ERROR' });
    expect(EngineHandler.getService(id)).not.toBeNull();
  });

  test('oversize batch → job ends with an error, never a partial result', async () => {
    const s = fakeSocket();
    const id = await readyLease(s, 'analysis');
    const p = EngineHandler.getService(id).submit('analysis', { state: base() });
    await tick();
    const job = s.last('engine:job');
    s.client('engine:line', { leaseId: id, jobId: job.jobId, lines: ['INFO PV 0', 'INFO EVAL 10', 'INFO BESTLINE 1,1', 'INFO PV DONE'] });
    s.client('engine:line', { leaseId: id, jobId: job.jobId, lines: ['x'.repeat(2000)] });
    s.client('engine:done', { leaseId: id, jobId: job.jobId, moveLine: '1,1' });
    expect(await p).toMatchObject({ ok: false, code: 'ENGINE_ERROR' });
  });

  test('load error before ready ends the lease', async () => {
    const s = fakeSocket();
    const r = await s.request({ purpose: 'hint' });
    s.client('engine:error', { leaseId: r.leaseId, code: 'ENGINE_LOAD_FAILED' });
    expect(s.last('engine:end')).toEqual({ leaseId: r.leaseId, reason: 'client_error' });
  });
});

describe('lease end', () => {
  test('game over revokes only that game\'s leases, sends engine:end, refuses the token', async () => {
    const a = fakeSocket('u1'); const b = fakeSocket('u2');
    const ra = await a.request({ purpose: 'hint', gameId: 'g1' });
    const rb = await b.request({ purpose: 'hint', gameId: 'g2' });
    expect(EngineHandler.revokeForGame('g1')).toBe(1);
    expect(a.last('engine:end')).toEqual({ leaseId: ra.leaseId, reason: 'game_over' });
    expect(b.last('engine:end')).toBeUndefined();
    expect(EngineHandler.getLeaseManager().verifyToken(ra.token)).toBeNull();
    expect(EngineHandler.getLeaseManager().verifyToken(rb.token)).not.toBeNull();
  });

  test('disconnect revokes the socket\'s leases (no grace); in-flight job resolves, not hangs', async () => {
    const s = fakeSocket();
    const id = await readyLease(s);
    const p = EngineHandler.getService(id).submit('hint', { state: base() });
    await tick();
    s.connected = false;
    s.client('disconnect', 'transport close');
    expect(EngineHandler.getService(id)).toBeNull();
    expect(s.last('engine:end')).toBeUndefined(); // nothing sent to a closed socket
    const r = await p;
    expect(r).toMatchObject({ ok: false, code: 'ENGINE_ERROR' });
  });

  test('game over mid-opponent-job → fallback move at once (game never stalls)', async () => {
    const s = fakeSocket();
    const id = await readyLease(s, 'opponent', 'g9');
    const t0 = Date.now();
    const p = EngineHandler.getService(id).playOpponent({ state: base(), difficulty: 'hard' }, () => ({}));
    await tick();
    EngineHandler.revokeForGame('g9');
    const r = await p;
    expect(r).toMatchObject({ ok: true, source: 'fallback' });
    expect(Date.now() - t0).toBeLessThan(1000);
  });

  test('never-ready lease is swept after the ready timeout', async () => {
    const s = fakeSocket();
    const r = await s.request({ purpose: 'hint' });
    clock.t += 1001;
    EngineHandler.getLeaseManager().sweep();
    expect(s.last('engine:end')).toEqual({ leaseId: r.leaseId, reason: 'ready_timeout' });
  });
});

describe('GET /engine/<build>/<file>', () => {
  let server; let url;
  beforeAll(async () => {
    const app = express();
    app.use('/engine', createEngineFilesRouter({ getLeaseManager: EngineHandler.getLeaseManager, dir }));
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${server.address().port}/engine`;
  });
  afterAll(() => new Promise((r) => server.close(r)));
  const get = (p, token) => fetch(url + p, { headers: token ? { 'X-Engine-Token': token } : {} });

  test('valid token → file, wasm type, private immutable cache', async () => {
    const r = await fakeSocket().request({ purpose: 'hint' });
    const res = await get(`/${BUILD}/rapfi-single-simd128.wasm`, r.token);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/wasm');
    expect(res.headers.get('cache-control')).toBe('private, max-age=31536000, immutable');
    expect(await res.text()).toBe('wasm-bytes');
  });

  test('no / bad / revoked token → 403 no-store', async () => {
    const r = await fakeSocket().request({ purpose: 'hint' });
    for (const tok of [null, 'garbage']) {
      const res = await get(`/${BUILD}/rapfi-single-simd128.js`, tok);
      expect(res.status).toBe(403);
      expect(res.headers.get('cache-control')).toBe('no-store');
    }
    EngineHandler.revokeLease(r.leaseId);
    expect((await get(`/${BUILD}/rapfi-single-simd128.js`, r.token)).status).toBe(403);
  });

  test('token in the query string is not accepted', async () => {
    const r = await fakeSocket().request({ purpose: 'hint' });
    const res = await fetch(`${url}/${BUILD}/rapfi-single-simd128.js?t=${encodeURIComponent(r.token)}`);
    expect(res.status).toBe(403);
  });

  test.each([
    [`/${BUILD}/secret.txt`], [`/${BUILD}/rapfi-multi-simd128.wasm`], ['/000000000000/rapfi-single-simd128.js'],
    [`/${BUILD}/..%2Fsecret.txt`], ['/../package.json'],
  ])('unknown build/file %s → 404 even with a valid token', async (p) => {
    const r = await fakeSocket().request({ purpose: 'hint' });
    const res = await get(p, r.token);
    expect(res.status).toBe(404);
  });
});
