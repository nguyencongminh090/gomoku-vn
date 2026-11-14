// preload: print server event-loop delay stats every 2 s to stderr (no server code change)
const { monitorEventLoopDelay } = require('perf_hooks');
const h = monitorEventLoopDelay({ resolution: 5 }); h.enable();
const t0 = Date.now();
setInterval(() => { process.stderr.write(`ELD t=${((Date.now() - t0) / 1000).toFixed(0)} p50=${(h.percentile(50) / 1e6).toFixed(1)} p99=${(h.percentile(99) / 1e6).toFixed(1)} max=${(h.max / 1e6).toFixed(1)}\n`); h.reset(); }, 2000).unref();
