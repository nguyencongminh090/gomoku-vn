// Run: SP=<scratch> tools/perf/room-join-timing.sh <label> — CHROME=<chromium binary> if Playwright's pinned revision is absent
// #391: time a table join (index.html → room.html?id=…) under Cloudflare-like latency (CDP throttling).
// Marks are performance.now() on room.html, i.e. ms since that navigation started:
//   dcl = DOMContentLoaded, io = io() called, connect = socket 'connect', joined = first 'room:joined'.
const path = require('path');
const REPO = process.env.REPO, B = process.env.BASE, RUNS = +(process.env.RUNS || 5);
const LAT = +(process.env.LATENCY || 150), KBPS = +(process.env.KBPS || 1250), CPU = +(process.env.CPU || 4);
const { chromium } = require(path.join(REPO, 'node_modules/playwright'));
const ioc = require(path.join(REPO, 'node_modules/socket.io-client'));
async function guest() {
  const r = await fetch(B + '/api/auth/guest', { method: 'POST', headers: { origin: B } });
  const cookie = r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  const s = ioc(B, { transports: ['websocket'], extraHeaders: { cookie, origin: B }, forceNew: true });
  await new Promise((ok, ko) => { s.on('connect', ok); s.on('connect_error', ko); });
  return s;
}
// Wrap window.io the moment socket.io.min.js assigns it: mark io()/connect/room:joined, count io() calls.
const HOOK = () => {
  let real;
  window.__ioCalls = 0;
  Object.defineProperty(window, 'io', {
    configurable: true,
    get() { return real; },
    set(v) {
      real = function (...a) {
        window.__ioCalls++; performance.mark('io');
        const s = v.apply(this, a);
        s.once('connect', () => performance.mark('connect'));
        s.onAny((ev) => { if (ev === 'room:joined' && !performance.getEntriesByName('joined').length) performance.mark('joined'); });
        return s;
      };
      Object.assign(real, v);
    },
  });
  document.addEventListener('DOMContentLoaded', () => performance.mark('dcl'));
};
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
(async () => {
  const host = await guest();
  const roomId = await new Promise((ok) => { host.once('room:joined', d => ok(d.roomId)); host.emit('room:create', { settings: { boardSize: 15, timerMode: 'per_game', timerSeconds: 600, ranked: false } }); });
  const browser = await chromium.launch({ executablePath: process.env.CHROME || undefined });
  const rows = { cold: [], warm: [] };
  const errs = [];
  for (let i = 0; i < RUNS; i++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(B + '/login.html'); await page.click('#btn-guest'); await page.waitForURL(u => !/login/.test(u.toString()));
    await page.addInitScript(HOOK);
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: LAT, downloadThroughput: KBPS * 1024, uploadThroughput: KBPS * 512 });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
    for (const kind of ['cold', 'warm']) {
      await page.goto(B + '/index.html'); await page.waitForTimeout(1500);
      await page.goto(`${B}/room.html?id=${encodeURIComponent(roomId)}`);
      await page.waitForFunction(() => performance.getEntriesByName('joined').length, null, { timeout: 30000 });
      const m = await page.evaluate(() => {
        const g = (n) => { const e = performance.getEntriesByName(n)[0]; return e ? Math.round(e.startTime) : null; };
        return { dcl: g('dcl'), io: g('io'), connect: g('connect'), joined: g('joined'), ioCalls: window.__ioCalls, ws: (window.RoomClient && window.RoomClient === window.__gvnSharedClient) };
      });
      rows[kind].push(m);
    }
    await ctx.close();
  }
  await browser.close(); host.close();
  const out = { label: process.env.LABEL, latencyMs: LAT, kbps: KBPS, cpu: CPU, runs: RUNS, errs };
  for (const k of ['cold', 'warm']) {
    out[k] = { median: Object.fromEntries(['dcl', 'io', 'connect', 'joined'].map(f => [f, med(rows[k].map(r => r[f]))])), ioCalls: [...new Set(rows[k].map(r => r.ioCalls))], sharedClient: [...new Set(rows[k].map(r => r.ws))], rows: rows[k] };
  }
  console.log(JSON.stringify(out, null, 1));
})().catch(e => { console.error(e); process.exit(1); });
