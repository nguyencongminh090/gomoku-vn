const p = JSON.parse(require('fs').readFileSync(process.argv[2]));
const byId = new Map(p.nodes.map(n => [n.id, n]));
const parent = new Map(); for (const n of p.nodes) for (const c of n.children || []) parent.set(c, n.id);
const cnt = {}; for (const s of p.samples) cnt[s] = (cnt[s] || 0) + 1;
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
