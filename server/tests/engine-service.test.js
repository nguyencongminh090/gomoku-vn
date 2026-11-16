'use strict';
const fs = require('fs');
const path = require('path');
const { GameEngine } = require('../managers/GameEngine');
const { EngineService, FakeTransport, stateFromGame, fallbackCandidates } = require('../engine');

const fx = (n) => fs.readFileSync(path.join(__dirname, 'fixtures/engine', n), 'utf8').split('\n').filter(Boolean);
const base = (o = {}) => ({ boardSize: 15, winningRule: 'freestyle', walls: [], portals: [], firstMoveZones: [], moves: [], ...o });
const svc = (script, opts, t) => { const transport = t || new FakeTransport(script, opts); return [new EngineService({ transport, stopGraceMs: 30 }), transport]; };

describe('EngineService + FakeTransport', () => {
  test('analysis: sends the job once, parses the fixture, emits progress', async () => {
    const [s, t] = svc([fx('mate-black-to-move.txt')]);
    const prog = []; s.on('progress', (p) => prog.push(p.event.kind));
    const r = await s.submit('analysis', { state: base({ moves: [{ x: 7, y: 7 }, { x: 7, y: 9 }, { x: 8, y: 7 }, { x: 8, y: 9 }, { x: 9, y: 7 }, { x: 3, y: 3 }] }), nbest: 1 });
    expect(r.ok).toBe(true);
    expect(r.result.stm).toBe('BLACK');
    expect(r.result.best.eval.mateIn).toBe(3);
    expect(t.sent).toHaveLength(1);
    expect(prog).toContain('pv');
  });

  test('verify: forced win in moves', async () => {
    const [s] = svc([fx('mate-black-to-move.txt')]);
    const r = await s.submit('verify', { state: base({ moves: new Array(6).fill(0).map((_, i) => ({ x: i, y: 0 })) }) });
    expect(r.result).toMatchObject({ forcedWin: true, mateInPlies: 3, mateInMoves: 2, bestMove: { x: 6, y: 7 } });
  });

  test('hint returns the best move', async () => {
    const [s] = svc([fx('white-to-move.txt')]);
    const r = await s.submit('hint', { state: base({ moves: new Array(5).fill(0).map((_, i) => ({ x: i, y: 1 })) }) });
    expect(r.result.move).toEqual({ x: 6, y: 7 });
  });

  test('ERROR Unknown command = desync', async () => {
    const [s] = svc([['OK', 'ERROR Unknown command: 0']]);
    const r = await s.submit('analysis', { state: base() });
    expect(r).toMatchObject({ ok: false, code: 'ENGINE_DESYNC' });
  });

  test('silence → STOP at deadline → timeout when no move line arrives', async () => {
    const [s, t] = svc([null]);
    const r = await s.submit('opponent', { state: base(), clockMs: 200 });
    expect(r).toMatchObject({ ok: false, code: 'ENGINE_TIMEOUT' });
    expect(t.stops).toBe(1);
  });

  test('a stopped search still emits its move line → result accepted', async () => {
    const [s, t] = svc([null], { stopReply: ['4,4'] });
    const r = await s.submit('opponent', { state: base(), clockMs: 200 });
    expect(r.ok).toBe(true); expect(r.result.move).toEqual({ x: 4, y: 4 });
    expect(t.stops).toBe(1);
  });

  test('one job in flight: second submit waits for the first move line', async () => {
    const order = [];
    const t = new FakeTransport([(l) => { order.push('send1'); return ['1,1']; }, () => { order.push('send2'); return ['2,2']; }]);
    const [s] = svc(null, null, t);
    const [a, b] = await Promise.all([
      s.submit('opponent', { state: base() }, { slot: 'a' }), s.submit('opponent', { state: base({ moves: [{ x: 1, y: 1 }] }) }, { slot: 'b' }),
    ]);
    expect(order).toEqual(['send1', 'send2']);
    expect(a.result.move).toEqual({ x: 1, y: 1 }); expect(b.result.move).toEqual({ x: 2, y: 2 });
  });

  test('stale: newer submit in the same slot drops the queued older one without sending it', async () => {
    const t = new FakeTransport([['1,1'], ['2,2'], ['3,3']]);
    const [s] = svc(null, null, t);
    const first = s.submit('opponent', { state: base() });
    const second = s.submit('opponent', { state: base({ moves: [{ x: 1, y: 1 }] }) });
    const third = s.submit('opponent', { state: base({ moves: [{ x: 2, y: 2 }] }) });
    const [r1, r2, r3] = await Promise.all([first, second, third]);
    expect(r1.code).toBe('ENGINE_STALE'); expect(r2.code).toBe('ENGINE_STALE'); expect(r3.ok).toBe(true);
    expect(t.sent).toHaveLength(1);
  });

  test('unknown purpose is a caller error', async () => {
    const [s] = svc([[]]);
    await expect(s.submit('nope', { state: base() })).rejects.toThrow(/ENGINE_UNKNOWN_PURPOSE/);
  });
});

describe('playOpponent — validation, retry, fallback', () => {
  const mkGame = (walls = []) => new GameEngine({
    roomId: 'r', boardSize: 15, walls, firstMoveZones: walls.length ? [{ x: 7, y: 7 }] : [],
    players: [{ userId: 'bot', color: 'BLACK' }, { userId: 'h', color: 'WHITE' }],
  });

  test('legal engine move is applied through GameEngine.makeMove', async () => {
    const g = mkGame();
    const [s] = svc([['7,7']]);
    const r = await s.playOpponent({ state: stateFromGame(g) }, (x, y) => g.makeMove('bot', x, y));
    expect(r).toMatchObject({ ok: true, source: 'engine', move: { x: 7, y: 7 }, attempts: 1 });
    expect(g.board[7][7]).toBe(1);
  });

  test('illegal move → retry with that cell in YXBLOCK → accepted', async () => {
    const g = mkGame([{ x: 3, y: 3 }]);
    g.makeMove('bot', 7, 7); g.makeMove('h', 8, 8); g.makeMove('bot', 11, 11); g.makeMove('h', 9, 8);
    const t = new FakeTransport([['3,3'], ['6,6']]);
    const [s] = svc(null, null, t);
    const r = await s.playOpponent({ state: stateFromGame(g) }, (x, y) => g.makeMove('bot', x, y));
    expect(r).toMatchObject({ ok: true, source: 'engine', attempts: 2, move: { x: 6, y: 6 } });
    expect(t.sent[1]).toEqual(expect.arrayContaining(['YXBLOCK', '3,3']));
  });

  test('two illegal moves → fallback picks a legal centre-out cell', async () => {
    const g = mkGame([{ x: 3, y: 3 }]);
    g.makeMove('bot', 7, 7); g.makeMove('h', 8, 8);
    const [s] = svc([['3,3']]); // wall cell, then again
    const r = await s.playOpponent({ state: stateFromGame(g) }, (x, y) => g.makeMove('bot', x, y));
    expect(r).toMatchObject({ ok: true, source: 'fallback', reason: 'CELL_IS_WALL' });
  });

  test('first move on a wall board comes from the zone, the engine is not asked', async () => {
    const g = mkGame([{ x: 3, y: 3 }]);
    const [s, t] = svc([['0,0']]);
    const r = await s.playOpponent({ state: stateFromGame(g) }, (x, y) => g.makeMove('bot', x, y));
    expect(r).toMatchObject({ ok: true, source: 'zone', move: { x: 7, y: 7 } });
    expect(t.sent).toHaveLength(0);
  });

  test('engine failure (timeout) → fallback, game never stalls', async () => {
    const g = mkGame();
    g.makeMove('bot', 7, 7); g.makeMove('h', 8, 8);
    const [s] = svc([null]);
    const r = await s.playOpponent({ state: stateFromGame(g), clockMs: 200 }, (x, y) => g.makeMove('bot', x, y));
    expect(r).toMatchObject({ ok: true, source: 'fallback', reason: 'ENGINE_TIMEOUT' });
  });

  test('fallbackCandidates skips walls/portals/stones and orders centre-out', () => {
    const c = fallbackCandidates(base({ boardSize: 5, walls: [{ x: 2, y: 2 }], moves: [{ x: 1, y: 2 }] }));
    expect(c[0]).toEqual({ x: 2, y: 1 });
    expect(c.find((p) => p.x === 2 && p.y === 2)).toBeUndefined();
    expect(c).toHaveLength(25 - 2);
  });
});
