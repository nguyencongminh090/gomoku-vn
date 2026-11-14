// Perf harness: one real browser player (A, measured) vs a socket.io bot (B).
// Usage: node harness.js <baseUrl> <boardSize> <moves> <cpuThrottle> <theme stone|paper> <width>
const path = require('path');
const REPO = process.env.REPO;
const { chromium } = require(path.join(REPO, 'node_modules/playwright'));
const ioc = require(path.join(REPO, 'node_modules/socket.io-client'));

const [B, SIZE = '20', MOVES = '160', CPU = '4', THEME = 'stone', WIDTH = '390'] = process.argv.slice(2);
const N = +SIZE, TOTAL = +MOVES;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const uniq = Date.now().toString(36).slice(-6);

function wouldFive(board, x, y, c) {
  for (const [dx, dy] of [[1,0],[0,1],[1,1],[1,-1]]) {
    let n = 1;
    for (const s of [1, -1]) { let i = 1; while (true) { const a = x + dx*i*s, b = y + dy*i*s; if (a<0||b<0||a>=N||b>=N||board[b][a]!==c) break; n++; i++; } }
    if (n >= 5) return true;
  }
  return false;
}
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
function pick(board, c) {
  // cluster near the centre, like a real game
  for (let tries = 0; tries < 5000; tries++) {
    const r = Math.min(N/2, 3 + tries/200);
    const x = Math.floor(N/2 + (rnd()*2-1)*r), y = Math.floor(N/2 + (rnd()*2-1)*r);
    if (x<0||y<0||x>=N||y>=N||board[y][x]) continue;
    if (!wouldFive(board, x, y, c)) return [x, y];
  }
  throw new Error('no move');
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome' });
  const ctxA = await browser.newContext({ viewport: { width: +WIDTH, height: +WIDTH < 500 ? 844 : 900 }, locale: 'vi-VN' });
  const regA = await ctxA.request.post(B + '/api/auth/register', { data: { username: 'pa' + uniq, password: 'Passw0rd!x', displayName: 'PerfA' } });
  const ja = await regA.json();
  const userA = ja.user;
  await ctxA.addInitScript(([u, theme]) => {
    localStorage.setItem('gvn_user', JSON.stringify({ userId: u.userId, displayName: u.displayName, isGuest: false }));
    try { const p = JSON.parse(localStorage.getItem('gvn_board_prefs') || '{}'); } catch {}
  }, [userA, THEME]);

  // Bot B
  const ctxB = await browser.newContext();
  const regB = await ctxB.request.post(B + '/api/auth/register', { data: { username: 'pb' + uniq, password: 'Passw0rd!x', displayName: 'PerfB' } });
  const userB = (await regB.json()).user;
  const cookieB = (await ctxB.cookies()).map(c => `${c.name}=${c.value}`).join('; ');
  const sb = ioc(B, { transports: ['websocket'], extraHeaders: { cookie: cookieB, origin: B } });
  await new Promise((res, rej) => { sb.on('connect', res); sb.on('connect_error', rej); });
  const roomId = await new Promise((res) => {
    sb.once('room:joined', (d) => res(d.roomId));
    sb.emit('room:create', { settings: { boardSize: N, timerMode: 'per_game', timerSeconds: 3600, roomName: 'perf', ranked: false } });
  });
  sb.on('room:error', (e) => console.log('BOT room:error', JSON.stringify(e))); sb.on('game:error', (e) => console.log('BOT game:error', JSON.stringify(e)));
  sb.onAny((ev, d) => { if (!process.env.QUIET && ev !== 'game:moved') console.log('BOT<', ev, JSON.stringify(d).slice(0, 300)); });
  sb.emit('room:sit', { slot: 1 });

  const page = await ctxA.newPage();
  const cdp = await ctxA.newCDPSession(page);
  // wire bytes per event name, both directions
  const wire = { in: {}, out: {} };
  const add = (dir, payload) => {
    const m = /^\d+\[?"([^"]+)"/.exec(payload) || /^(\d+)/.exec(payload);
    const k = !m ? "?" : /^\d+$/.test(m[1]) ? (payload.startsWith("43") ? "ack" : payload.length < 4 ? "ping/pong" : "num:" + payload.slice(0, 3)) : m[1];
    const w = wire[dir][k] || (wire[dir][k] = { n: 0, bytes: 0, max: 0 });
    if (k === 'game:moved' && !wire.sample) wire.sample = payload; w.n++; w.bytes += payload.length; w.max = Math.max(w.max, payload.length);
  };
  await cdp.send('Network.enable');
  cdp.on('Network.webSocketFrameReceived', (e) => add('in', e.response.payloadData));
  cdp.on('Network.webSocketFrameSent', (e) => add('out', e.response.payloadData));

 page.on('framenavigated', f => { if (f === page.mainFrame()) console.log('NAV', f.url()); });
  page.on('pageerror', (e) => console.error('PAGEERR', e.message));
  await page.goto(B + '/room.html?id=' + encodeURIComponent(roomId));
  await page.waitForTimeout(3000); console.log('URL', page.url(), await page.evaluate(() => [!!window.RoomClient, !!window.RoomUI, !!window.GameUI]));
  await page.waitForFunction(() => window.RoomClient && window.RoomUI && window.GameUI, null, { timeout: 15000 });
  await sleep(800);
  if (THEME === 'paper' || THEME === 'stone') {
    await page.evaluate((th) => { try { window.BoardPrefs && window.BoardPrefs.set && window.BoardPrefs.set({ theme: th, showMoveNumbers: true }); } catch (e) { console.log(e); } }, THEME);
  }
  // instrumentation
  await page.evaluate(() => {
    const T = window.__perf = { ev: {}, fn: {}, long: [] };
    const rec = (o, k, ms) => { const r = o[k] || (o[k] = []); r.push(ms); };
    const wrap = (obj, name, label) => {
      const f = obj[name]; if (typeof f !== 'function') return;
      obj[name] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { rec(T.fn, label, performance.now() - t); } };
    };
    wrap(window.BoardRenderer.prototype, '_draw', 'board._draw');
    wrap(window.GameUI, 'updateBoardState', 'GameUI.updateBoardState');
    wrap(window.RoomUI, 'updateUI', 'RoomUI.updateUI');
    wrap(window.GameUI, 'renderTimers', 'GameUI.renderTimers');
    wrap(window.BoardRenderer.prototype, 'resize', 'board.resize');
    const sock = window.RoomClient.socket || (window.__gvnSharedClient && window.__gvnSharedClient.socket);
    const proto = Object.getPrototypeOf(sock);
    const onevent = proto.onevent;
    proto.onevent = function (packet) {
      const t = performance.now();
      try { return onevent.call(this, packet); } finally { rec(T.ev, packet.data && packet.data[0], performance.now() - t); }
    };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) T.long.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] });
  });

  await page.evaluate(() => window.RoomClient.emit('room:sit', { slot: 2 }));
  await sleep(500);
  const board = Array.from({ length: N }, () => Array(N).fill(0));
  let colorA = null, turn = null, moveCount = 0, ended = false;
  sb.on('game:init', (d) => {
    turn = d.currentTurn;
    const pa = d.players.find(p => p.userId === userA.userId);
    colorA = pa.color === 'BLACK' ? 1 : 2;
  });
  sb.on('game:moved', (d) => { board[d.y][d.x] = d.color === 'BLACK' ? 1 : 2; turn = d.nextTurn; moveCount = d.moveCount; if (d.gameOver) ended = true; });
  sb.on('game:ended', () => { ended = true; });
  await page.evaluate(() => window.RoomClient.emit('room:ready'));
  sb.emit('room:ready');
  for (let i = 0; i < 50 && !colorA; i++) await sleep(100);
  if (!colorA) throw new Error('game did not start');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: +CPU });
  await page.evaluate(() => { window.__perf.ev = {}; window.__perf.fn = {}; window.__perf.long = []; });
  for (const k of ['in', 'out']) wire[k] = {};

  const rects = [];
  async function shot(tag) {
    await sleep(400);
    const r = await page.evaluate(() => { const svg = [...document.querySelectorAll('svg')].find(s => s.__gboard); const b = svg.getBoundingClientRect(); const c = document.getElementById('game-controls'); const cr = c ? c.getBoundingClientRect() : null;
      return { board: [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.bottom)], controls: cr ? [Math.round(cr.top), Math.round(cr.height)] : null, vh: innerHeight, vw: innerWidth, overlap: !!(cr && cr.height && cr.top < b.bottom && cr.bottom > b.top && cr.left < b.right && cr.right > b.left) }; });
    rects.push([tag, r]);
    await page.screenshot({ path: `${process.env.SHOTS}/${tag}-${THEME}-${WIDTH}.png` });
  }
  const snaps = []; let profOn = false; await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  const t0 = Date.now();
  while (moveCount < TOTAL && !ended) {
    const before = moveCount;
    if (turn === userB.userId) {
      const [x, y] = pick(board, colorA === 1 ? 2 : 1);
      sb.emit('game:move', { x, y, moveId: 'b' + moveCount }, () => {});
    } else {
      const [x, y] = pick(board, colorA);
      await page.evaluate(([x, y]) => { const g = document.querySelector('svg').__gboard || [...document.querySelectorAll('svg')].map(s => s.__gboard).find(Boolean); g.onCellClick(x, y); }, [x, y]);
    }
    for (let i = 0; i < 200 && moveCount === before && !ended; i++) await sleep(5);
    await sleep(60);
    if (process.env.SHOTS && moveCount === 40 && !global.__shot40) { global.__shot40 = 1; await shot('mid'); }
    if (!profOn && moveCount >= TOTAL - 40) { profOn = true; await cdp.send('Profiler.start'); }
    if (false) snaps.push([moveCount, await page.evaluate(() => JSON.parse(JSON.stringify(window.__perf)))]);
  }
  if (process.env.SHOTS) {
    await shot('end-of-loop');
    sb.emit('game:draw_offer'); await shot('draw-offer');
    sb.emit('game:resign'); await sleep(600); await shot('game-over');
    console.log('RECTS', JSON.stringify(rects));
  }
  await sleep(500);
  if (profOn) { const { profile } = await cdp.send('Profiler.stop'); const self = {}; const total = profile.timeDeltas.reduce((a,b)=>a+b,0); const cnt = {}; for (const id of profile.samples) cnt[id]=(cnt[id]||0)+1; const per = total/profile.samples.length; for (const n of profile.nodes) { const c=cnt[n.id]||0; if(!c) continue; const cf=n.callFrame; const k=(cf.functionName||'(anon)')+' '+cf.url.replace(/^.*\//,'').replace(/\?.*/,'')+':'+(cf.lineNumber+1); self[k]=(self[k]||0)+c*per/1000; } console.log('PROFILE top self ms (last 40 moves):'); for (const [k,v] of Object.entries(self).sort((a,b)=>b[1]-a[1]).slice(0,25)) console.log('  ', v.toFixed(1).padStart(7), k); }
  const perf = await page.evaluate(() => window.__perf);
  const stat = (a) => { if (!a || !a.length) return '-'; const s = [...a].sort((x, y) => x - y); const avg = a.reduce((x, y) => x + y, 0) / a.length; return `n=${a.length} avg=${avg.toFixed(1)} p50=${s[s.length >> 1].toFixed(1)} max=${s[s.length - 1].toFixed(1)}`; };
  const last20 = (a) => a ? a.slice(-20) : [];
  const first20 = (a) => a ? a.slice(0, 20) : [];
  console.log(`== size=${N} moves=${moveCount} cpu=${CPU}x theme=${THEME} width=${WIDTH} elapsed=${Date.now() - t0}ms`);
  for (const [k, a] of Object.entries(perf.ev)) console.log(`ev ${k.padEnd(18)} all: ${stat(a)} | first20: ${stat(first20(a))} | last20: ${stat(last20(a))}`);
  for (const [k, a] of Object.entries(perf.fn)) console.log(`fn ${k.padEnd(24)} all: ${stat(a)} | first20: ${stat(first20(a))} | last20: ${stat(last20(a))}`);
  console.log('longtasks', perf.long.length, JSON.stringify(perf.long.slice(-30)));
  console.log('domNodes', await page.evaluate(() => document.getElementsByTagName('*').length));
  for (const d of ['in', 'out']) {
    let tb = 0, tn = 0;
    for (const [k, w] of Object.entries(wire[d])) { console.log(`wire ${d} ${k.padEnd(20)} n=${w.n} bytes=${w.bytes} avg=${(w.bytes / w.n).toFixed(0)} max=${w.max}`); tb += w.bytes; tn += w.n; }
    console.log(`wire ${d} TOTAL n=${tn} bytes=${tb} perMove=${(tb / Math.max(1, moveCount)).toFixed(0)}`);
  }
  console.log('SAMPLE', wire.sample);
  sb.close();
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
