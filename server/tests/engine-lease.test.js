'use strict';
/** #405: LeaseManager (grant/token/TTL/revoke) + ClientWasmTransport contract under EngineService. */
const { LeaseManager } = require('../engine/LeaseManager');
const { ClientWasmTransport } = require('../engine/transports/ClientWasmTransport');
const { EngineService } = require('../engine/EngineService');

const SECRET = 'test-secret';
const clock = (t0 = 1_000_000) => { const c = { t: t0, now: () => c.t }; return c; };
const lm = (c, opts) => new LeaseManager({ secret: SECRET, now: c.now, ...opts });
const g = (m, o = {}) => m.grant({ userId: 'u1', socketId: 's1', purpose: 'analysis', gameId: 'g1', ...o });

describe('LeaseManager', () => {
  test('grant → token verifies to the lease; tampered / foreign-secret / malformed tokens refused', () => {
    const c = clock(); const m = lm(c);
    const { lease, token } = g(m);
    expect(lease).toMatchObject({ userId: 'u1', socketId: 's1', purpose: 'analysis', gameId: 'g1', state: 'granted' });
    expect(m.verifyToken(token)).toBe(lease);
    const [id, exp, mac] = token.split('.');
    expect(m.verifyToken(`${id}.${Number(exp) + 1}.${mac}`)).toBeNull();          // exp edited
    expect(m.verifyToken(`${id}.${exp}.${mac.slice(0, -1)}${mac.endsWith('A') ? 'B' : 'A'}`)).toBeNull(); // mac edited
    expect(lm(c, { secret: 'other' }).verifyToken(token)).toBeNull();
    for (const bad of [undefined, '', 'x', `${token}.x`, 'a'.repeat(300)]) expect(m.verifyToken(bad)).toBeNull();
  });

  test('token TTL boundary: valid at exp-1, refused at exp', () => {
    const c = clock(); const m = lm(c, { tokenTtlMs: 1000, idleTtlMs: 1e9, readyTimeoutMs: 1e9 });
    const { token } = g(m);
    c.t += 999; expect(m.verifyToken(token)).not.toBeNull();
    c.t += 1; expect(m.verifyToken(token)).toBeNull();
  });

  test('revoke: unexpired token refused immediately (live-lease denylist), end emitted once', () => {
    const c = clock(); const m = lm(c);
    const ends = []; m.on('end', (l, r) => ends.push([l.id, r]));
    const { lease, token } = g(m);
    expect(m.revoke(lease.id, 'game_over')).toBe(true);
    expect(m.revoke(lease.id, 'again')).toBe(false);
    expect(m.verifyToken(token)).toBeNull();
    expect(m.owned(lease.id, 's1')).toBeNull();
    expect(ends).toEqual([[lease.id, 'game_over']]);
  });

  test('same user+purpose replaces the old lease; other purpose coexists; per-user and global caps', () => {
    const c = clock(); const m = lm(c, { maxPerUser: 2, maxLeases: 3 });
    const ends = []; m.on('end', (l, r) => ends.push(r));
    const a = g(m).lease;
    const b = g(m).lease;
    expect(ends).toEqual(['replaced']);
    expect(m.get(a.id)).toBeNull(); expect(m.get(b.id)).toBe(b);
    g(m, { purpose: 'hint' });
    expect(() => g(m, { purpose: 'verify' })).toThrow(expect.objectContaining({ code: 'ENGINE_LEASE_LIMIT' }));
    g(m, { userId: 'u2', socketId: 's2' });
    expect(() => g(m, { userId: 'u3', socketId: 's3' })).toThrow(expect.objectContaining({ code: 'ENGINE_LEASE_LIMIT' }));
  });

  test('owned(): foreign socket refused', () => {
    const m = lm(clock());
    const { lease } = g(m);
    expect(m.owned(lease.id, 's1')).toBe(lease);
    expect(m.owned(lease.id, 's2')).toBeNull();
    expect(m.owned('nope', 's1')).toBeNull();
  });

  test('sweep: never-ready lease ends at ready timeout; ready lease ends after idle TTL; touch extends', () => {
    const c = clock(); const m = lm(c, { readyTimeoutMs: 100, idleTtlMs: 1000 });
    const ends = []; m.on('end', (l, r) => ends.push([l.id, r]));
    const a = g(m).lease;
    const b = g(m, { purpose: 'hint' }).lease;
    m.markReady(b.id);
    c.t += 100; m.sweep(); expect(ends).toEqual([]);
    c.t += 1; m.sweep(); expect(ends).toEqual([[a.id, 'ready_timeout']]);
    c.t += 800; m.touch(b.id);
    c.t += 1000; m.sweep(); expect(m.get(b.id)).toBe(b);
    c.t += 1; m.sweep(); expect(ends[1]).toEqual([b.id, 'idle']);
  });

  test('revokeBySocket / revokeByGame only hit matching leases; null gameId never matches', () => {
    const m = lm(clock());
    const a = g(m).lease;
    const b = g(m, { userId: 'u2', socketId: 's2', gameId: null }).lease;
    expect(m.revokeByGame(null)).toBe(0);
    expect(m.revokeByGame('g1')).toBe(1);
    expect(m.get(a.id)).toBeNull();
    expect(m.revokeBySocket('s1')).toBe(0);
    expect(m.revokeBySocket('s2')).toBe(1);
    expect(m.get(b.id)).toBeNull();
  });
});

// ── Transport under EngineService ───────────────────────────────────────────
const base = (o = {}) => ({ boardSize: 15, winningRule: 'freestyle', walls: [], portals: [], firstMoveZones: [], moves: [], ...o });

function rig({ stopGraceMs = 20 } = {}) {
  const out = [];
  const t = new ClientWasmTransport({ leaseId: 'L', emit: (ev, data) => out.push([ev, data]) });
  t.setReady();
  const s = new EngineService({ transport: t, stopGraceMs });
  const nextJob = async () => {
    for (let i = 0; i < 50; i++) {
      const j = out.filter(([ev]) => ev === 'engine:job').pop();
      if (j && j[1].jobId === t.inFlight) return j[1];
      await new Promise((r) => setImmediate(r));
    }
    throw new Error('no job');
  };
  return { t, s, out, nextJob };
}

describe('groupCommands (#405 WASM one-command-per-call)', () => {
  const { groupCommands } = require('../engine/transports/ClientWasmTransport');
  test('blocks joined, other lines alone, order kept', () => {
    expect(groupCommands(['INFO RULE 0', 'START 15', 'YXBOARD', '7,7,1', '8,8,2', 'DONE', 'YXBLOCK', '1,1', 'DONE', 'YXNBEST 1']))
      .toEqual(['INFO RULE 0', 'START 15', 'YXBOARD\n7,7,1\n8,8,2\nDONE', 'YXBLOCK\n1,1\nDONE', 'YXNBEST 1']);
    expect(groupCommands(['YXBOARD', 'DONE'])).toEqual(['YXBOARD\nDONE']);
  });
  test('unterminated block refused (would make the engine exit)', () => {
    expect(() => groupCommands(['YXBOARD', '7,7,1'])).toThrow(expect.objectContaining({ code: 'ENGINE_BAD_STATE' }));
  });
});

describe('ClientWasmTransport', () => {
  test('job goes out once; lines + done produce the result; move only counted via done', async () => {
    const { t, s, out, nextJob } = rig();
    const p = s.submit('hint', { state: base({ moves: [{ x: 7, y: 7 }] }) });
    const job = await nextJob();
    expect(job.leaseId).toBe('L');
    // One command per entry; the YXBOARD block travels whole (WASM loop reads one command per call).
    expect(job.commands).toContain('YXBOARD\n7,7,1\nDONE');
    expect(job.commands.every((c) => !/^(DONE|\d+,\d+)/.test(c))).toBe(true);
    expect(t.deliverLines(job.jobId, ['MESSAGE hi', '3,3'])).toBe('ok'); // bare move inside a batch is ignored
    expect(t.inFlight).toBe(job.jobId);
    expect(t.deliverDone(job.jobId, '8,7')).toBe('ok');
    const r = await p;
    expect(r).toMatchObject({ ok: true, result: { move: { x: 8, y: 7 } } });
    expect(out.filter(([ev]) => ev === 'engine:job')).toHaveLength(1);
  });

  test('not ready / busy: send refused', () => {
    const t = new ClientWasmTransport({ leaseId: 'L', emit: () => {} });
    expect(() => t.send(['A'])).toThrow(expect.objectContaining({ code: 'ENGINE_NOT_READY' }));
    t.setReady(); t.send(['A']);
    expect(() => t.send(['B'])).toThrow(expect.objectContaining({ code: 'ENGINE_BUSY' }));
  });

  test('stale job output dropped (wrong jobId, after done, after close)', () => {
    const t = new ClientWasmTransport({ leaseId: 'L', emit: () => {} });
    const seen = []; t.onLine((l) => seen.push(l));
    t.setReady();
    const id = t.send(['X']);
    expect(t.deliverLines('other', ['MESSAGE a'])).toBe('stale');
    expect(t.deliverDone('other', '1,1')).toBe('stale');
    expect(t.deliverDone(id, '1,1')).toBe('ok');
    expect(t.deliverLines(id, ['MESSAGE late'])).toBe('stale');
    expect(t.deliverDone(id, '2,2')).toBe('stale');
    t.close();
    expect(t.deliverLines(id, ['x'])).toBe('stale');
    expect(seen).toEqual(['1,1']);
  });

  test('size caps: batch count, line length, per-job total, move line shape', () => {
    const t = new ClientWasmTransport({ leaseId: 'L', emit: () => {}, limits: { linesPerBatch: 3, lineChars: 10, linesPerJob: 5, moveLineChars: 12 } });
    t.setReady();
    const id = t.send(['X']);
    expect(t.deliverLines(id, ['a', 'b', 'c', 'd'])).toBe('ENGINE_PAYLOAD_TOO_LARGE');
    expect(t.deliverLines(id, ['x'.repeat(11)])).toBe('ENGINE_PAYLOAD_TOO_LARGE');
    expect(t.deliverLines(id, [42])).toBe('ENGINE_PAYLOAD_TOO_LARGE');
    expect(t.deliverLines(id, 'abc')).toBe('ENGINE_PAYLOAD_TOO_LARGE');
    expect(t.deliverLines(id, ['a', 'b', 'c'])).toBe('ok');
    expect(t.deliverLines(id, ['a', 'b', 'c'])).toBe('ENGINE_PAYLOAD_TOO_LARGE'); // 6 > 5 per job
    expect(t.deliverDone(id, '1,1 2,2 3,3 4,4')).toBe('ENGINE_PAYLOAD_TOO_LARGE');
    expect(t.deliverDone(id, 'INFO X')).toBe('ENGINE_BAD_REQUEST');
    expect(t.deliverDone(id, 'SWAP')).toBe('ok');
  });

  test('silent client: stop → no move → TIMEOUT → reset clears the job; one engine:stop; late lines dropped', async () => {
    const { t, s, out, nextJob } = rig();
    const p = s.submit('opponent', { state: base({ moves: [{ x: 7, y: 7 }] }), difficulty: 'easy', clockMs: 10 });
    const job = await nextJob();
    const r = await p;
    expect(r).toMatchObject({ ok: false, code: 'ENGINE_TIMEOUT' });
    expect(t.inFlight).toBeNull();
    expect(out.filter(([ev]) => ev === 'engine:stop')).toEqual([['engine:stop', { leaseId: 'L', jobId: job.jobId, hard: true }]]);
    expect(t.deliverDone(job.jobId, '1,1')).toBe('stale');
  });

  test('client error mid-job → ENGINE_ERROR result, transport reusable', async () => {
    const { t, s, nextJob } = rig();
    const p = s.submit('hint', { state: base({ moves: [{ x: 7, y: 7 }] }) });
    const job = await nextJob();
    expect(t.deliverError(job.jobId)).toBe('ok');
    expect(await p).toMatchObject({ ok: false, code: 'ENGINE_ERROR' });
    expect(t.inFlight).toBeNull();
    const p2 = s.submit('hint', { state: base({ moves: [{ x: 7, y: 7 }] }) });
    const job2 = await nextJob();
    t.deliverDone(job2.jobId, '6,6');
    expect(await p2).toMatchObject({ ok: true, result: { move: { x: 6, y: 6 } } });
  });

  test('illegal client move → one retry with YXBLOCK → server fallback move', async () => {
    const { t, s, nextJob } = rig();
    const occupied = new Set(['7,7']);
    const validate = (x, y) => (occupied.has(`${x},${y}`) ? { error: 'occupied', code: 'CELL_TAKEN' } : {});
    const state = base({ moves: [{ x: 7, y: 7 }] });
    const p = s.playOpponent({ state, difficulty: 'easy' }, validate);
    const j1 = await nextJob(); t.deliverDone(j1.jobId, '7,7');
    const j2 = await nextJob();
    expect(j2.commands).toContain('YXBLOCK\n7,7\nDONE');
    t.deliverDone(j2.jobId, '7,7');
    const r = await p;
    expect(r).toMatchObject({ ok: true, source: 'fallback', attempts: 2, reason: 'CELL_TAKEN' });
    expect(occupied.has(`${r.move.x},${r.move.y}`)).toBe(false);
  });
});

describe('ClientWasmTransport multi variant (#408)', () => {
  const { threadsFor } = require('../engine/transports/ClientWasmTransport');
  test.each([[undefined, 1], [1, 1], [2, 1], [4, 3], [9, 8], [64, 8], ['8', 1], [2.5, 1], [-3, 1]])('threadsFor(%p) = %p', (cores, n) => {
    expect(threadsFor(cores)).toBe(n);
  });

  test('multi: THREAD_NUM from reported cores first; single: none', () => {
    const out = [];
    const m = new ClientWasmTransport({ leaseId: 'L', variant: 'multi', emit: (e, d) => out.push(d) });
    m.setReady({ cores: 4 });
    m.send(['INFO RULE 0', 'YXNBEST 1']);
    expect(out[0].commands).toEqual(['INFO THREAD_NUM 3', 'INFO RULE 0', 'YXNBEST 1']);
    const sOut = [];
    const s1 = new ClientWasmTransport({ leaseId: 'L', emit: (e, d) => sOut.push(d) });
    s1.setReady({ cores: 16 });
    s1.send(['INFO RULE 0']);
    expect(sOut[0].commands).toEqual(['INFO RULE 0']);
    expect(new ClientWasmTransport({ leaseId: 'L', variant: 'bogus', emit: () => {} }).variant).toBe('single');
  });

  test('multi stop: YXSTOP command, engine answers → job resolves ok (no respawn)', async () => {
    const out = [];
    const t = new ClientWasmTransport({ leaseId: 'L', variant: 'multi', emit: (ev, d) => out.push([ev, d]) });
    t.setReady({ cores: 2 });
    const s = new EngineService({ transport: t, stopGraceMs: 200 });
    const p = s.submit('analysis', { state: base({ moves: [{ x: 7, y: 7 }] }), deadlineMs: 500 });
    for (let i = 0; i < 100 && !out.some(([ev]) => ev === 'engine:stop'); i++) await new Promise((r) => setTimeout(r, 10));
    const stop = out.find(([ev]) => ev === 'engine:stop')[1];
    expect(stop).toEqual({ leaseId: 'L', jobId: t.inFlight, command: 'YXSTOP' });
    t.deliverLines(stop.jobId, ['INFO PV 0', 'INFO NUMPV 1', 'INFO EVAL 12', 'INFO BESTLINE 8,8', 'INFO PV DONE']);
    t.deliverDone(stop.jobId, '8,8');
    const r = await p;
    expect(r.ok).toBe(true);
    expect(r.result.best.line[0]).toEqual({ x: 8, y: 8 });
    expect(out.filter(([ev]) => ev === 'engine:stop')).toHaveLength(1);
  });

  test('multi stop unanswered → TIMEOUT → reset sends ONE hard stop (engine may still be thinking)', async () => {
    const out = [];
    const t = new ClientWasmTransport({ leaseId: 'L', variant: 'multi', emit: (ev, d) => out.push([ev, d]) });
    t.setReady({ cores: 2 });
    const s = new EngineService({ transport: t, stopGraceMs: 20 });
    const r = await s.submit('analysis', { state: base({ moves: [{ x: 7, y: 7 }] }), deadlineMs: 500 });
    expect(r.code).toBe('ENGINE_TIMEOUT');
    const stops = out.filter(([ev]) => ev === 'engine:stop').map(([, d]) => d);
    expect(stops.map((d) => d.command || (d.hard && 'hard'))).toEqual(['YXSTOP', 'hard']);
    expect(stops[0].jobId).toBe(stops[1].jobId);
  });
});
