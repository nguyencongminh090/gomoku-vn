const p = JSON.parse(require('fs').readFileSync(process.argv[2]));
const byId = new Map(p.nodes.map(n => [n.id, n]));
const parent = new Map(); for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n.id);
// #388: optional argv[3] argv[4] = window in seconds since profile start (e.g. the storm second from the ELD log)
const from = process.argv[3] != null ? +process.argv[3] * 1e6 : -Infinity, to = process.argv[4] != null ? +process.argv[4] * 1e6 : Infinity;
const cnt = {}; let tt = 0; for (let i = 0; i < p.samples.length; i++) { tt += p.timeDeltas[i]; if (tt >= from && tt < to) cnt[p.samples[i]] = (cnt[p.samples[i]] || 0) + 1; }
const per = (p.endTime - p.startTime) / p.samples.length / 1000;
const self = {}, incl = {};
const key = (n) => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.replace(/^.*\//, '')}:${n.callFrame.lineNumber + 1}`;
for (const [id, c] of Object.entries(cnt)) {
  const n = byId.get(+id); self[key(n)] = (self[key(n)] || 0) + c * per;
  const seen = new Set(); let cur = +id;
  while (cur != null) { const k = key(byId.get(cur)); if (!seen.has(k)) { seen.add(k); incl[k] = (incl[k] || 0) + c * per; } cur = parent.get(cur); }
}
const show = (o, filt) => Object.entries(o).filter(([k]) => !filt || filt.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 22).forEach(([k, v]) => console.log(v.toFixed(0).padStart(7), k));
console.log('--- self'); show(self, /^(?!\(idle|\(program)/);
console.log('--- inclusive (app)'); show(incl, /state\.js|RoomManager|SocketHandler|seat-rating|database|GameHandler|home|socket\.js|broadcast|encoder|index\.js/);
