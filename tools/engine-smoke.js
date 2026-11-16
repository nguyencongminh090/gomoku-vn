#!/usr/bin/env node
'use strict';
/**
 * Dev-only smoke: drives the NATIVE pbrain-rapfi through the same Job/Purpose/Parser code (F404). Not shipped.
 *   node tools/engine-smoke.js <path/to/pbrain-rapfi>
 */
const { spawn } = require('child_process');
const path = require('path');
const readline = require('readline');
const { EngineService, EngineTransport } = require('../server/engine');
const { GameEngine } = require('../server/managers/GameEngine');
const { stateFromGame } = require('../server/engine');

class NativeProcessTransport extends EngineTransport {
  constructor(bin) {
    super();
    this.bin = bin;
    this.p = spawn(bin, [], { cwd: path.dirname(bin), stdio: ['pipe', 'pipe', 'inherit'] });
    this.cbs = new Set();
    readline.createInterface({ input: this.p.stdout }).on('line', (l) => this.cbs.forEach((cb) => cb(l)));
  }
  send(lines) { this.p.stdin.write(`${lines.join('\n')}\n`); }
  onLine(cb) { this.cbs.add(cb); return () => this.cbs.delete(cb); }
  stop() { this.p.stdin.write('STOP\n'); }
  reset() { this.cbs.clear(); this.p.kill(); Object.assign(this, new NativeProcessTransport(this.bin)); }
  close() { this.p.kill(); }
}

(async () => {
  const bin = process.argv[2];
  if (!bin) { console.error('usage: engine-smoke.js <pbrain-rapfi>'); process.exit(2); }
  const t = new NativeProcessTransport(bin);
  const s = new EngineService({ transport: t });
  const g = new GameEngine({
    roomId: 'smoke', boardSize: 15, winningRule: 'caro',
    walls: [{ x: 5, y: 5 }, { x: 9, y: 9 }], portals: [{ a: { x: 2, y: 2 }, b: { x: 12, y: 12 } }],
    firstMoveZones: [{ x: 6, y: 5 }, { x: 4, y: 5 }],
    players: [{ userId: 'bot', color: 'BLACK' }, { userId: 'h', color: 'WHITE' }],
  });
  const log = (...a) => console.log(...a);
  let r = await s.playOpponent({ state: stateFromGame(g), difficulty: 'hard', style: 1 }, (x, y) => g.makeMove('bot', x, y));
  log('opponent 1st move', JSON.stringify(r));
  g.makeMove('h', 8, 8);
  r = await s.playOpponent({ state: stateFromGame(g), difficulty: 'hard', style: 1 }, (x, y) => g.makeMove('bot', x, y));
  log('opponent 2nd move (wall distance >= 4 from 1st)', JSON.stringify(r));
  const a = await s.submit('analysis', { state: stateFromGame(g), nbest: 3, maxNode: 20000 });
  log('analysis', a.ok ? a.result.pvs.map((p) => `${p.eval.raw} ${(p.winrate).toFixed(3)} ${p.line[0].x},${p.line[0].y}`) : a.code);
  const v = await s.submit('verify', { state: { boardSize: 15, winningRule: 'freestyle', walls: [], portals: [], firstMoveZones: [], moves: [[7,7],[7,9],[8,7],[8,9],[9,7],[3,3]].map(([x, y]) => ({ x, y })) } });
  log('verify mate', v.ok ? JSON.stringify({ ...v.result, analysis: undefined }) : v.code);
  t.close();
})().catch((e) => { console.error(e); process.exit(1); });
