'use strict';
const fs = require('fs');
const path = require('path');
const { EngineOutputParser, parseValue, winrateFromCp, cpFromWinrate, toBlackView, dedupeLine, barValue, ENGINE_SCALING_FACTOR } = require('../engine');
const { AnalysisPurpose } = require('../engine/purposes/AnalysisPurpose');

const fx = (n) => fs.readFileSync(path.join(__dirname, 'fixtures/engine', n), 'utf8');
const lines = (n) => fx(n).split('\n').filter(Boolean);
const run = (ls) => { const p = new EngineOutputParser(); return ls.flatMap((l) => p.feed(l)); };
const analyse = (events, stm) => new AnalysisPurpose().parse(events, { stm });

describe('EngineOutputParser — real fixtures (native binary 2026-10-30)', () => {
  test('wall+portal style board: 4 PV lines (style forces NUMPV 4), move is the last bare line', () => {
    const ev = run(lines('wall-portal-style1.txt'));
    const last = ev.filter((e) => e.kind === 'pv').pop();
    expect(last.numpv).toBe(4);
    expect(ev.filter((e) => e.kind === 'move')).toHaveLength(1);
    expect(ev[ev.length - 1]).toMatchObject({ kind: 'move', cells: [{ x: 8, y: 6 }] });
    expect(ev.some((e) => e.kind === 'unknown')).toBe(false);
  });

  test('mate: +M3 for the side to move, winrate 1', () => {
    const a = analyse(run(lines('mate-black-to-move.txt')), 'BLACK');
    expect(a.best.eval.mateIn).toBe(3);
    expect(a.best.winrate).toBe(1);
    expect(a.best.line[0]).toEqual({ x: 6, y: 7 });
    expect(a.played).toEqual({ x: 6, y: 7 });
  });

  test('White to move: eval is from White; evalBlack flips sign', () => {
    const ev = run(lines('white-to-move.txt'));
    const w = analyse(ev, 'WHITE'); const b = analyse(ev, 'BLACK');
    expect(w.best.evalBlack.cp).toBe(-w.best.eval.cp);
    expect(b.best.evalBlack.cp).toBe(b.best.eval.cp);
    expect(w.best.evalBlack.winrate).toBeCloseTo(1 - w.best.winrate, 9);
  });

  test('ERROR line is an error event (desync signal), ack and move survive', () => {
    const ev = run(lines('error-and-block.txt'));
    expect(ev.find((e) => e.kind === 'error').text).toMatch(/Unknown command/);
    expect(ev.some((e) => e.kind === 'ack')).toBe(true);
    expect(ev[ev.length - 1].kind).toBe('move');
  });

  test('random chunk splits give identical events', () => {
    const text = fx('wall-portal-style1.txt');
    const whole = run(lines('wall-portal-style1.txt'));
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let t = 0; t < 5; t++) {
      const p = new EngineOutputParser(); const ev = [];
      for (let i = 0; i < text.length;) { const n = 1 + Math.floor(rnd() * 90); ev.push(...p.feedChunk(text.slice(i, i + n))); i += n; }
      expect(ev).toEqual(whole);
    }
  });
});

describe('EngineOutputParser — message modes', () => {
  const core = ['OK', 'INFO PV 0', 'INFO NUMPV 1', 'INFO DEPTH 5', 'INFO SELDEPTH 6', 'INFO NODES 10', 'INFO TOTALNODES 10',
    'INFO TOTALTIME 2', 'INFO SPEED 5000', 'INFO EVAL 68', 'INFO WINRATE 0.62', 'INFO BESTLINE 8,6 6,8', 'INFO PV DONE'];
  const modes = {
    none: [],
    brief: ['MESSAGE Speed 1005K | Depth 10-15 | Eval 81 | Node 3015 | Time 3ms', 'MESSAGE Bestline I7 G9 H9'],
    normal: ['MESSAGE Depth 5-5 | Eval 68 | Time 0ms | I7 G9', 'MESSAGE REALTIME BEST 8,6'],
    ucilike: ['MESSAGE depth 5-5 multipv 1 ev 68 n 173 n/ms 173 tm 0 pv I7 G9', 'REALTIME POS 8,6'],
  };
  const stream = (extra) => [...core, ...extra, '8,6'];

  test('same result in every mode; extras only add events', () => {
    const results = Object.values(modes).map((m) => analyse(run(stream(m)), 'BLACK'));
    results.forEach((r) => expect(r).toEqual(results[0]));
    expect(results[0].played).toEqual({ x: 8, y: 6 });
  });

  test('extras are parsed into typed events and labels map to cells', () => {
    const ev = run(stream([...modes.brief, ...modes.normal, ...modes.ucilike]));
    expect(ev.find((e) => e.kind === 'summary' && e.nodes)).toMatchObject({ depth: 10, seldepth: 15, eval: '81', nodes: 3015 });
    expect(ev.find((e) => e.kind === 'summary' && e.bestline).bestline[0]).toEqual({ x: 8, y: 6 });
    expect(ev.filter((e) => e.kind === 'progress')).toHaveLength(2);
    expect(ev.filter((e) => e.kind === 'realtime').map((e) => e.what)).toEqual(['BEST', 'POS']);
  });

  test('unknown lines never throw and are kept', () => {
    expect(run(['WHATEVER 1 2'])).toEqual([{ kind: 'unknown', raw: 'WHATEVER 1 2' }]);
  });

  test('registry: a new matcher needs no other change', () => {
    const p = new EngineOutputParser();
    p.register({ id: 'db', test: (l) => l.startsWith('DATABASE x'), parse: (l) => ({ kind: 'db', raw: l }) }, { priority: 5 });
    expect(p.feed('DATABASE x 1')).toEqual([{ kind: 'db', raw: 'DATABASE x 1' }]);
  });
});

describe('normalizer', () => {
  test('parseValue', () => {
    expect(parseValue('-45')).toMatchObject({ cp: -45, mateIn: null });
    expect(parseValue('+M3')).toMatchObject({ cp: null, mateIn: 3 });
    expect(parseValue('-M2')).toMatchObject({ mateIn: -2 });
    expect(parseValue('+M*')).toMatchObject({ mateIn: null, mateDb: 1 });
  });
  test('scale factor reproduces live engine pairs (not 200)', () => {
    for (const [cp, w] of [[126, 0.7229], [16, 0.5304], [133, 0.7334], [-45, 0.4152]]) {
      expect(Math.abs(winrateFromCp(cp) - w)).toBeLessThan(1e-3);
    }
    expect(ENGINE_SCALING_FACTOR).toBeCloseTo(131.3979, 4);
    expect(cpFromWinrate(winrateFromCp(80))).toBeCloseTo(80, 6);
  });
  test('black view flips only with side to move; mate line dedupes the repeated first cell', () => {
    const v = parseValue('+M3');
    expect(toBlackView(v, 1, 'BLACK').mateIn).toBe(3);
    expect(toBlackView(v, 1, 'WHITE')).toMatchObject({ mateIn: -3, winrate: 0 });
    expect(dedupeLine([{ x: 6, y: 7 }, { x: 6, y: 7 }, { x: 9, y: 9 }])).toHaveLength(2);
    expect(barValue({ mateIn: -3, cp: null })).toBe(-9997);
  });
  test('PV history keeps earlier blocks, final = last per index', () => {
    const mk = (d, e) => ['INFO PV 0', `INFO DEPTH ${d}`, `INFO EVAL ${e}`, 'INFO WINRATE 0.5', 'INFO BESTLINE 1,1', 'INFO PV DONE'];
    const a = analyse(run([...mk(2, 10), ...mk(3, 20), '1,1']), 'BLACK');
    expect(a.pvs).toHaveLength(1);
    expect(a.best.eval.cp).toBe(20);
    expect(a.best.history).toEqual([{ depth: 2, eval: '10' }]);
  });
});
