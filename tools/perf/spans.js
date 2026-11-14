const p = JSON.parse(require('fs').readFileSync(process.argv[2]));
const byId = new Map(p.nodes.map(n => [n.id, n]));
const parent = new Map(); for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n.id);
const key = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.replace(/^.*\//, '')}:${n.callFrame.lineNumber + 1}`;
let t = p.startTime; const ts = p.timeDeltas.map(d => (t += d));
const end = p.endTime, from = end - 28e6; // last ~28 s (measuring window + tail)
let span = null; const spans = [];
for (let i = 0; i < p.samples.length; i++) {
  if (ts[i] < from) continue;
  const n = byId.get(p.samples[i]); const idle = /\(idle\)/.test(n.callFrame.functionName);
  if (!idle) { if (!span) span = { s: ts[i], e: ts[i], ids: [] }; span.e = ts[i]; span.ids.push(p.samples[i]); }
  else if (span) { spans.push(span); span = null; }
}
const long = spans.filter(s => s.e - s.s > 30000);
console.log('busy spans >30ms in window:', long.length);
for (const s of long.slice(0, 6)) {
  const incl = {};
  for (const id of s.ids) { const seen = new Set(); let c = id; while (c != null) { const k = key(byId.get(c)); if (!seen.has(k)) { seen.add(k); incl[k] = (incl[k] || 0) + 1; } c = parent.get(c); } }
  console.log(`span ${((s.e - s.s) / 1000).toFixed(0)}ms:`, Object.entries(incl).filter(([k]) => /\.js:/.test(k) && !/node:|timers|task_queues|^\(anon\) :|listOnTimeout|processTimers/.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}=${(v / s.ids.length * 100).toFixed(0)}%`).join(' | '));
}
