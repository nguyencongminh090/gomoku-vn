'use strict';
const { GameEngine } = require('../managers/GameEngine');
const RM = require('../engine/RuleMapper');
const { JobFactory } = require('../engine/Job');
const { defaultRegistry } = require('../engine/purposes');

const base = (o = {}) => ({ boardSize: 15, winningRule: 'freestyle', walls: [], portals: [], torus: false, firstMoveZones: [], moves: [], ...o });
const P = defaultRegistry();
const job = (purpose, state, extra = {}, blocked) => JobFactory.create(P.get(purpose), { state, ...extra }, { blocked });

describe('RuleMapper', () => {
  test.each([['freestyle', 0], ['standard', 1], ['caro', 8]])('%s → RULE %i', (r, id) => {
    expect(job('analysis', base({ winningRule: r })).lines).toContain(`INFO RULE ${id}`);
  });
  test('unsupported rule / bad state throw codes', () => {
    expect(() => job('analysis', base({ winningRule: 'renju' }))).toThrow(/ENGINE_RULE_UNSUPPORTED/);
    expect(() => job('analysis', base({ boardSize: 40 }))).toThrow(/ENGINE_BAD_STATE/);
    expect(() => job('analysis', base({ moves: [{ x: 99, y: 0 }] }))).toThrow(/ENGINE_BAD_STATE/);
  });
  test('walls first (3), stones alternate 1/2 in move order, portals + torus after START', () => {
    const l = job('analysis', base({
      walls: [{ x: 5, y: 5 }], portals: [{ a: { x: 2, y: 2 }, b: { x: 12, y: 12 } }], torus: true,
      moves: [{ x: 7, y: 7 }, { x: 8, y: 8 }, { x: 7, y: 8 }],
    })).lines;
    const i = (s) => l.indexOf(s);
    expect(i('START 15')).toBeLessThan(i('INFO TORUS 1'));
    expect(i('INFO CLEARPORTALS')).toBeLessThan(i('INFO YXPORTAL 2,2 12,12'));
    expect(l.slice(i('YXBOARD'), i('YXBOARD') + 6)).toEqual(['YXBOARD', '5,5,3', '7,7,1', '8,8,2', '7,8,1', 'DONE']);
    expect(l[l.length - 1]).toBe('YXNBEST 3');
  });
  test('first move on a wall board is a zone move (isZoneFirstMove), never sent as a giant YXBLOCK', () => {
    const st = base({ walls: [{ x: 5, y: 5 }], firstMoveZones: [{ x: 4, y: 5 }] });
    expect(RM.isZoneFirstMove(st)).toBe(true);
    expect(RM.isZoneFirstMove({ ...st, moves: [{ x: 4, y: 5 }] })).toBe(false);
    expect(RM.isZoneFirstMove(base())).toBe(false);
    expect(job('opponent', st).lines).not.toContain('YXBLOCK');
  });
  test('wall rule distance uses the SEARCH commands: own 2nd move → YXPLAYSELF 4; opponent 2nd move → YXOPPDIST 4', () => {
    const w = { walls: [{ x: 1, y: 1 }] };
    const last = (purpose, moves, extra) => { const l = job(purpose, base({ ...w, moves }), extra).lines; return l[l.length - 1]; };
    expect(last('opponent', [{ x: 7, y: 7 }, { x: 3, y: 3 }])).toBe('YXPLAYSELF 4');
    expect(last('opponent', [{ x: 7, y: 7 }])).toBe('YXOPPDIST 4');
    expect(last('opponent', [{ x: 7, y: 7 }, { x: 3, y: 3 }, { x: 9, y: 9 }])).toBe('YXNBEST 1');
    expect(last('hint', [{ x: 7, y: 7 }])).toBe('YXOPPDIST 4');
    expect(last('analysis', [{ x: 7, y: 7 }])).toBe('YXNBEST 3');
    expect(job('opponent', base({ moves: [{ x: 7, y: 7 }] })).lines.join(' ')).not.toMatch(/PLAYSELF|OPPDIST/);
    // never a bare config line: they are search commands and would trigger a premature search
    expect(job('opponent', base({ ...w, moves: [{ x: 7, y: 7 }] })).lines.filter((x) => /PLAYSELF|OPPDIST/.test(x))).toHaveLength(1);
  });
  test('extra blocked cells are appended; lines contain only protocol-safe text', () => {
    const j = job('opponent', base({ moves: [{ x: 7, y: 7 }] }), {}, [{ x: 8, y: 8 }]);
    expect(j.lines).toEqual(expect.arrayContaining(['YXBLOCK', '8,8']));
    j.lines.forEach((x) => expect(x).toMatch(/^[A-Za-z0-9_ ,]+$/));
  });
  test('analysis/verify force STYLE 0 + SHOW_DETAIL 2; opponent style only at full strength on special boards', () => {
    expect(job('analysis', base(), { style: 3 }).lines).toEqual(expect.arrayContaining(['INFO STYLE 0', 'INFO SHOW_DETAIL 2']));
    const wall = base({ walls: [{ x: 1, y: 1 }] });
    expect(job('opponent', wall, { difficulty: 'hard', style: 2 }).lines).toContain('INFO STYLE 2');
    expect(job('opponent', wall, { difficulty: 'easy', style: 2 }).lines).toContain('INFO STYLE 0');
    expect(job('opponent', base(), { difficulty: 'hard', style: 2 }).lines).toContain('INFO STYLE 0');
  });
  test('job key is stable for equal lines and changes with the position', () => {
    const a = job('analysis', base({ moves: [{ x: 7, y: 7 }] })); const b = job('analysis', base({ moves: [{ x: 7, y: 7 }] }));
    expect(a.key).toBe(b.key); expect(a.id).not.toBe(b.id);
    expect(job('analysis', base({ moves: [{ x: 7, y: 8 }] })).key).not.toBe(a.key);
  });
  test('hint refuses rated games', () => {
    expect(() => job('hint', base(), { rated: true })).toThrow(/ENGINE_HINT_FORBIDDEN/);
  });
  test('stateFromGame mirrors a real GameEngine', () => {
    const g = new GameEngine({ roomId: 'r', boardSize: 15, players: [{ userId: 'a', color: 'BLACK' }, { userId: 'b', color: 'WHITE' }], winningRule: 'caro' });
    g.makeMove('a', 7, 7);
    expect(RM.stateFromGame(g)).toMatchObject({ winningRule: 'caro', boardSize: 15, moves: [{ x: 7, y: 7 }] });
  });
});
