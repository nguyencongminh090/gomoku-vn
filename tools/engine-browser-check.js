#!/usr/bin/env node
'use strict';
/**
 * Real-browser pass for #405 (dev only, not shipped). Boots the real server in-process on its own port and a
 * throwaway DB, logs in as a guest in headless Chromium, starts EngineHost on /social.html (a page with no
 * socket of its own), then drives jobs from the server: analysis → opponent → forced stop (worker respawn) →
 * hint → game over (revoke). Prints one JSON report; exit 0 only when every check passed.
 *
 *   PLAYWRIGHT_BROWSERS_PATH=~/.local/share/ms-playwright node tools/engine-browser-check.js [--port 3102] [--browser firefox] [--heavy] [--multi] [--headed]
 * --multi: serves /social.html cross-origin isolated (ENGINE_ISOLATED_PAGES) so the host gets the multi-thread build.
 * Needs the #406 build in server/engine-files/<id>/ (or ENGINE_FILES_DIR).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const PORT = Number(arg('--port', 3102));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-check-'));
Object.assign(process.env, {
  PORT: String(PORT),
  GOMOKU_DB_PATH: path.join(tmp, 'check.db'),
  ENGINE_LEASES_ENABLED: 'true',
  ENGINE_ISOLATED_PAGES: process.argv.includes('--multi') ? '/social.html' : '',
  JWT_SECRET: process.env.JWT_SECRET || crypto.randomBytes(32).toString('base64url'),
  CORS_ORIGIN: `http://localhost:${PORT}`,
  LOG_LEVEL: process.env.LOG_LEVEL || 'warn',
});

const { server, io } = require('../server/index.js');
const EngineHandler = require('../server/socket/handlers/EngineHandler');
const B = `http://localhost:${PORT}`;
const GAME = 'browser-check-1';
const report = { checks: {}, server: {}, browser: {}, console: [] };
const check = (k, ok, detail) => { report.checks[k] = ok ? 'ok' : `FAIL ${detail === undefined ? '' : JSON.stringify(detail)}`; };
const state = (moves) => ({ boardSize: 15, winningRule: 'freestyle', walls: [], portals: [], firstMoveZones: [], moves });
const OPENING = [{ x: 7, y: 7 }, { x: 8, y: 8 }, { x: 8, y: 7 }];

EngineHandler.setAuthorizer(({ gameId }) => (gameId === GAME ? true : 'ENGINE_FORBIDDEN'));
const serverDone = new Promise((resolve) => {
  EngineHandler.onLeaseReady(async ({ leaseId, service }) => {
    const t = (fn) => async () => { const t0 = Date.now(); const r = await fn(); return { ms: Date.now() - t0, r }; };
    // Output volume per job (sizes the caps in ClientWasmTransport / EngineHandler RATE).
    const tr = service.transport; const vol = new Map(); report.server.volume = {};
    const orig = tr.deliverLines.bind(tr);
    tr.deliverLines = (jobId, lines) => {
      const v = vol.get(jobId) || vol.set(jobId, { lines: 0, batches: 0, maxBatch: 0, perSec: new Map() }).get(jobId);
      const r = orig(jobId, lines);
      v.lines += lines.length; v.batches++; v.maxBatch = Math.max(v.maxBatch, lines.length);
      const sec = Math.floor(Date.now() / 1000); v.perSec.set(sec, (v.perSec.get(sec) || 0) + 1);
      v.result = r === 'ok' ? v.result : r;
      return r;
    };
    const measure = (name, jobId) => {
      const v = vol.get(jobId); if (!v) return;
      report.server.volume[name] = { lines: v.lines, batches: v.batches, maxBatch: v.maxBatch, peakBatchesPerSec: Math.max(...v.perSec.values()), rejected: v.result || null };
    };
    const lastJob = () => tr.lastJobId;
    const send = tr.send.bind(tr); tr.send = (lines) => { tr.lastJobId = send(lines); return tr.lastJobId; };
    try {
      if (process.argv.includes('--heavy')) {
        const hv = await t(() => service.submit('analysis', { state: state(OPENING), nbest: 8, maxNode: 5000000, deadlineMs: 60000 }))();
        measure('analysis nbest8 5M', lastJob());
        report.server.heavyAnalysis = { ms: hv.ms, ok: hv.r.ok, code: hv.r.code, pvs: hv.r.ok && hv.r.result.pvs.length, stats: hv.r.ok && hv.r.result.stats };
        const vf = await t(() => service.submit('verify', { state: state(OPENING) }))();
        measure('verify defaults', lastJob());
        report.server.heavyVerify = { ms: vf.ms, ok: vf.r.ok, code: vf.r.code };
      }
      const a = await t(() => service.submit('analysis', { state: state(OPENING), nbest: 2, maxNode: 20000 }))();
      report.server.analysis = { ms: a.ms, ok: a.r.ok, code: a.r.code, best: a.r.ok && a.r.result.best && { line: a.r.result.best.line.slice(0, 3), eval: a.r.result.best.eval.raw, depth: a.r.result.best.depth } };
      measure('analysis nbest2 20k', lastJob());
      check('analysis job answered with a PV', a.r.ok && a.r.result.pvs.length >= 1 && a.r.result.best.line.length >= 1, a.r);

      const taken = new Set(OPENING.map((m) => `${m.x},${m.y}`));
      const o = await t(() => service.playOpponent({ state: state(OPENING), difficulty: 'normal' },
        (x, y) => (taken.has(`${x},${y}`) ? { error: 'taken', code: 'CELL_TAKEN' } : {})))();
      report.server.opponent = { ms: o.ms, ...o.r };
      check('opponent move came from the engine and is legal', o.r.ok && o.r.source === 'engine' && !taken.has(`${o.r.move.x},${o.r.move.y}`), o.r);

      // Forced stop: a long search with a 500 ms deadline. single → hard stop, worker respawn, TIMEOUT.
      // multi → YXSTOP, the engine answers with its best line so far (ok, no respawn).
      const multi = service.transport.variant === 'multi';
      report.server.variant = service.transport.variant; report.server.threads = service.transport.threads;
      const s = await t(() => service.submit('analysis', { state: state(OPENING), nbest: 4, maxNode: 5000000, deadlineMs: 500 }))();
      report.server.stopped = { ms: s.ms, ok: s.r.ok, code: s.r.code, depth: s.r.ok && s.r.result.best && s.r.result.best.depth };
      if (multi) check('multi: YXSTOP answered with a result before the stop grace ends', s.r.ok && s.ms < 1800, report.server.stopped);
      else check('stopped job ends with TIMEOUT within deadline + grace', !s.r.ok && s.r.code === 'ENGINE_TIMEOUT' && s.ms < 3000, report.server.stopped);

      const h = await t(() => service.submit('hint', { state: state(OPENING) }))();
      report.server.hintAfterRespawn = { ms: h.ms, ok: h.r.ok, move: h.r.ok && h.r.result.move };
      check('respawned worker answers the next job', h.r.ok && !!h.r.result.move, h.r);
    } catch (e) {
      check('server job flow threw', false, e && e.message);
    }
    report.server.revoked = EngineHandler.revokeForGame(GAME);
    resolve(leaseId);
  });
});

async function main() {
  await new Promise((r) => (server.listening ? r() : server.once('listening', r)));
  const pw = require('playwright');
  const kind = arg('--browser', 'chromium'); // chromium | firefox (installed revs only; never `playwright install`)
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), '.local/share/ms-playwright');
  const exe = path.join(root, kind === 'firefox' ? 'firefox-1538/firefox/firefox' : 'chromium-1243/chrome-linux64/chrome');
  report.browserKind = kind;
  const browser = await pw[kind].launch({ executablePath: exe, headless: !process.argv.includes('--headed') });
  try {
    const page = await (await browser.newContext({ baseURL: B })).newPage();
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') report.console.push(`${m.type()}: ${m.text()}`); });
    page.on('response', (r) => { if (r.status() >= 400) report.console.push(`http ${r.status()} ${new URL(r.url()).pathname}`); });
    page.on('pageerror', (e) => report.console.push(`pageerror: ${e.message}`));
    await page.goto('/login.html');
    await page.click('#btn-guest');
    await page.waitForURL((u) => !u.pathname.includes('login'), { timeout: 15000 });
    await page.goto('/social.html');
    const hostUrl = '/js/engine/engine-host.js';
    const start = await page.evaluate(async ({ hostUrl, GAME }) => {
      const { io } = await import('/vendor/socket.io/socket.io.esm.min.js');
      const { EngineHost, probeCapabilities } = await import(hostUrl);
      const socket = io({ transports: ['websocket'] });
      await new Promise((r) => socket.on('connect', r));
      const states = [];
      const host = new EngineHost(socket, { onState: (s) => states.push(s) });
      window.__engine = { host, states, socket };
      const t0 = performance.now();
      const forbidden = await new EngineHost(socket).start({ purpose: 'analysis', gameId: 'someone-else' });
      const r = await host.start({ purpose: 'analysis', gameId: GAME });
      window.__lines = [];
      const tap = (w) => w && w.addEventListener('message', (e) => window.__lines.push(e.data.type === 'line' ? e.data.text : JSON.stringify(e.data)));
      tap(host.worker);
      const spawn = host._spawn.bind(host);
      host._spawn = () => { const p = spawn(); tap(host.worker); return p; };
      return { caps: probeCapabilities(), isolated: globalThis.crossOriginIsolated === true, variant: host.variant, cores: navigator.hardwareConcurrency, forbidden, r, loadMs: Math.round(performance.now() - t0) };
    }, { hostUrl, GAME });
    report.browser.start = start;
    check('foreign game refused', start.forbidden.code === 'ENGINE_FORBIDDEN', start.forbidden);
    check('lease granted, worker loaded, engine:ready sent', start.r.ok === true, start.r);
    if (process.argv.includes('--multi')) check('isolated page runs the multi build', start.isolated && start.variant === 'multi', start);
    else check('normal page runs the single build (not isolated)', !start.isolated && start.variant === 'single', start);

    await Promise.race([serverDone, new Promise((r) => setTimeout(r, 240000))]);
    await page.waitForFunction(() => window.__engine.host.state === 'ended', null, { timeout: 10000 }).catch(() => {});
    const end = await page.evaluate(() => ({ state: window.__engine.host.state, worker: window.__engine.host.worker, states: window.__engine.states }));
    report.browser.end = end;
    report.browser.engineLines = await page.evaluate(() => window.__lines.slice(0, 60));
    check('game over → host ended, worker terminated', end.state === 'ended' && end.worker === null, end);

    const res = await page.evaluate(async () => {
      const r = await fetch('/engine/x/rapfi-single-simd128.wasm');
      return r.status;
    });
    check('file route refuses without token', res === 404 || res === 403, res);
    const wcsp = await page.evaluate(async () => (await fetch('/js/engine/engine.worker.js')).headers.get('content-security-policy'));
    report.browser.workerCsp = wcsp;
    check('no CSP errors in the console', !report.console.some((l) => /Content Security Policy|CSP/i.test(l)), report.console);
  } finally {
    await browser.close();
  }
}

main().catch((e) => check('harness', false, e && e.stack)).finally(() => {
  const failed = Object.values(report.checks).filter((v) => v !== 'ok').length;
  console.log(JSON.stringify(report, null, 2));
  io.disconnectSockets(true);
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(failed ? 1 : 0);
});
