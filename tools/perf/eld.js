// preload: print server event-loop delay stats every 2 s to stderr (no server code change)
const { monitorEventLoopDelay, performance } = require('perf_hooks');
const h = monitorEventLoopDelay({ resolution: 5 }); h.enable();
const t0 = Date.now();
setInterval(() => { process.stderr.write(`ELD t=${((Date.now() - t0) / 1000).toFixed(0)} p50=${(h.percentile(50) / 1e6).toFixed(1)} p99=${(h.percentile(99) / 1e6).toFixed(1)} max=${(h.max / 1e6).toFixed(1)}\n`); h.reset(); }, 2000).unref();
// #388: on any wall gap > 100 ms between 10 ms ticks, log what the process did meanwhile — CPU ≈ wall: real work;
// CPU ≪ wall + involuntary switches / major faults: descheduled (machine); + voluntary switches: blocked in a syscall.
let gT = performance.now(), gC = process.cpuUsage(), gR = process.resourceUsage();
setInterval(() => {
  const t = performance.now(), c = process.cpuUsage(), r = process.resourceUsage();
  if (t - gT > 100) process.stderr.write(`GAP t=${((Date.now() - t0) / 1000).toFixed(1)} wall=${(t - gT).toFixed(0)} cpu=${((c.user + c.system - gC.user - gC.system) / 1000).toFixed(0)} sys=${((c.system - gC.system) / 1000).toFixed(0)} invcs=${r.involuntaryContextSwitches - gR.involuntaryContextSwitches} volcs=${r.voluntaryContextSwitches - gR.voluntaryContextSwitches} majflt=${r.majorPageFault - gR.majorPageFault}\n`);
  gT = t; gC = c; gR = r;
}, 10).unref();
