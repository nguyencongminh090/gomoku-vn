// TCP proxy :3118 -> :3117 adding a fixed one-way delay per chunk (ordered), to mimic a ~100 ms RTT link.
const net = require('net'); const D = +(process.env.DELAY || 50);
function pipeDelayed(a, b) { let q = Promise.resolve(); a.on('data', (c) => { const t = Date.now() + D; q = q.then(() => new Promise((r) => setTimeout(() => { if (!b.destroyed) b.write(c); r(); }, Math.max(0, t - Date.now())))); }); a.on('end', () => q.then(() => b.end())); a.on('error', () => b.destroy()); }
net.createServer((c) => { const s = net.connect(3117, '127.0.0.1'); pipeDelayed(c, s); pipeDelayed(s, c); }).listen(3118);
