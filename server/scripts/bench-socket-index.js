'use strict';
/**
 * bench-socket-index.js — #383: findSocketsByUserId, old io.sockets scan vs the userId index.
 * Run: node server/scripts/bench-socket-index.js [sockets=10000] [disconnects=1000]
 */
const state = require('../socket/state');

const N = Number(process.argv[2]) || 10000;
const D = Number(process.argv[3]) || 1000;

function oldFind(io, userId, excludeId = null) {
  const out = [];
  for (const [, s] of io.sockets.sockets) {
    if (s.id === excludeId) continue;
    if (s.user && s.user.userId === userId) out.push(s);
  }
  return out;
}

const all = new Map();
for (let i = 0; i < N; i++) {
  const s = { id: `s${i}`, user: { userId: `u${i}` } };
  all.set(s.id, s);
  state.trackSocket(s);
}
const io = { sockets: { sockets: all } };
const targets = [];
for (let i = 0; i < D; i++) targets.push(all.get(`s${Math.floor((i * N) / D)}`));

function run(label, fn) {
  const t0 = process.hrtime.bigint();
  let found = 0;
  for (const s of targets) found += fn(s).length;
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`${label.padEnd(8)} ${D} lookups over ${N} sockets: ${ms.toFixed(2)} ms total, ${(ms / D * 1000).toFixed(1)} µs/lookup (found ${found})`);
  return ms;
}
const a = run('scan', (s) => oldFind(io, s.user.userId, s.id));
const b = run('index', (s) => state.findSocketsByUserId(io, s.user.userId, s.id));
console.log(`speed-up x${(a / Math.max(b, 1e-6)).toFixed(0)}`);
process.exit(0);
