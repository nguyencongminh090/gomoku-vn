// Long-session harness: browser player A vs socket bot B, GAMES games in one room.
const path = require('path');
const REPO = process.env.REPO;
const { chromium } = require(path.join(REPO, 'node_modules/playwright'));
const ioc = require(path.join(REPO, 'node_modules/socket.io-client'));
const [B, GAMES = '12', MOVES = '80', CPU = '4', WIDTH = '1280'] = process.argv.slice(2);
const N = 15;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const uniq = Date.now().toString(36).slice(-6);
function wouldFive(board, x, y, c) { for (const [dx, dy] of [[1,0],[0,1],[1,1],[1,-1]]) { let n = 1; for (const s of [1, -1]) { let i = 1; while (true) { const a = x + dx*i*s, b = y + dy*i*s; if (a<0||b<0||a>=N||b>=N||board[b][a]!==c) break; n++; i++; } } if (n >= 5) return true; } return false; }
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
function pick(board, c) { for (let tries = 0; tries < 5000; tries++) { const r = Math.min(N/2, 3 + tries/200); const x = Math.floor(N/2 + (rnd()*2-1)*r), y = Math.floor(N/2 + (rnd()*2-1)*r); if (x<0||y<0||x>=N||y>=N||board[y][x]) continue; if (!wouldFive(board, x, y, c)) return [x, y]; } throw new Error('no move'); }
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.HOME + '/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome', args: ['--js-flags=--expose-gc', '--autoplay-policy=no-user-gesture-required'] });
  const ctxA = await browser.newContext({ viewport: { width: +WIDTH, height: +WIDTH < 500 ? 844 : 900 }, locale: 'vi-VN' });
  const userA = (await (await ctxA.request.post(B + '/api/auth/register', { data: { username: 'la' + uniq, password: 'Passw0rd!x', displayName: 'LongA' } })).json()).user;
  await ctxA.addInitScript((u) => { localStorage.setItem('gvn_user', JSON.stringify({ userId: u.userId, displayName: u.displayName, isGuest: false })); }, userA);
  const ctxB = await browser.newContext();
  const userB = (await (await ctxB.request.post(B + '/api/auth/register', { data: { username: 'lb' + uniq, password: 'Passw0rd!x', displayName: 'LongB' } })).json()).user;
  const cookieB = (await ctxB.cookies()).map(c => `${c.name}=${c.value}`).join('; ');
  const sb = ioc(B, { transports: ['websocket'], extraHeaders: { cookie: cookieB, origin: B } });
  await new Promise((res, rej) => { sb.on('connect', res); sb.on('connect_error', rej); });
  const roomId = await new Promise((res) => { sb.once('room:joined', (d) => res(d.roomId)); sb.emit('room:create', { settings: { boardSize: N, timerMode: 'per_game', timerSeconds: 3600, roomName: 'long', ranked: false } }); });
  sb.emit('room:sit', { slot: 1 });
  const page = await ctxA.newPage();
  const cdp = await ctxA.newCDPSession(page);
  page.on('pageerror', (e) => console.error('PAGEERR', e.message));
  await page.goto(B + '/room.html?id=' + encodeURIComponent(roomId));
  await page.waitForFunction(() => window.RoomClient && window.RoomUI && window.GameUI, null, { timeout: 15000 });
  await sleep(800);
  await page.evaluate(() => {
    const T = window.__perf = { ev: {} };
    const sock = window.RoomClient.socket || (window.__gvnSharedClient && window.__gvnSharedClient.socket);
    const proto = Object.getPrototypeOf(sock); const onevent = proto.onevent;
    proto.onevent = function (packet) { const t = performance.now(); try { return onevent.call(this, packet); } finally { const k = packet.data && packet.data[0]; (T.ev[k] || (T.ev[k] = [])).push(performance.now() - t); } };
    // count AudioNodes created
    window.__audio = 0; const AC = window.AudioContext; if (AC) for (const m of ['createGain','createOscillator','createBufferSource','createBiquadFilter']) { const f = AC.prototype[m]; AC.prototype[m] = function (...a) { window.__audio++; return f.apply(this, a); }; }
    // count live setInterval / setTimeout
    window.__long = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__long.push(Math.round(e.duration)); }).observe({ entryTypes: ['longtask'] });
    window.__iv = new Set(); const si = window.setInterval, ci = window.clearInterval;
    window.setInterval = function (...a) { const id = si.apply(this, a); window.__iv.add(id); return id; };
    window.clearInterval = function (id) { window.__iv.delete(id); return ci.call(this, id); };
  });
  await page.mouse.click(5, 5); await sleep(800);
  console.log('ctx', await page.evaluate(() => window.audioManager && window.audioManager.ctx && window.audioManager.ctx.state), await page.evaluate(() => !!(window.audioManager && window.audioManager.moveSample)));
  await page.evaluate(() => window.RoomClient.emit('room:sit', { slot: 2 }));
  await sleep(500);
  await cdp.send('Performance.enable');
  const met = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
  let prev = await met();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: +CPU });
  let board, colorA, turn, moveCount, ended;
  sb.on('game:init', (d) => { turn = d.currentTurn; const pa = d.players.find(p => p.userId === userA.userId); colorA = pa.color === 'BLACK' ? 1 : 2; });
  sb.on('game:moved', (d) => { board[d.y][d.x] = d.color === 'BLACK' ? 1 : 2; turn = d.nextTurn; moveCount = d.moveCount; if (d.gameOver) ended = true; });
  sb.on('game:ended', () => { ended = true; });
  const rows = [];
  for (let g = 1; g <= +GAMES; g++) {
    board = Array.from({ length: N }, () => Array(N).fill(0)); colorA = null; moveCount = 0; ended = false;
    await page.evaluate(() => { window.__perf.ev = {}; });
    await page.evaluate(() => window.RoomClient.emit('room:ready'));
    sb.emit('room:ready');
    for (let i = 0; i < 100 && !colorA; i++) await sleep(100);
    if (!colorA) { console.log('game', g, 'did not start'); break; }
    const t0 = Date.now();
    while (moveCount < +MOVES && !ended) {
      const before = moveCount;
      if (turn === userB.userId) { const [x, y] = pick(board, colorA === 1 ? 2 : 1); sb.emit('game:move', { x, y, moveId: 'b' + g + '_' + moveCount }, () => {}); }
      else { const [x, y] = pick(board, colorA); await page.evaluate(([x, y]) => { const g = [...document.querySelectorAll('svg')].map(s => s.__gboard).find(Boolean); g.onCellClick(x, y); }, [x, y]); }
      for (let i = 0; i < 400 && moveCount === before && !ended; i++) await sleep(5);
      await sleep(30);
      if (+process.env.CHAT && moveCount % 4 === 0) sb.emit('chat:message', { text: 'tin nhan ' + g + ' ' + moveCount });
    }
    sb.emit('game:resign');
    for (let i = 0; i < 100 && !ended; i++) await sleep(50);
    await sleep(1500);
    const ev = await page.evaluate(() => window.__perf.ev);
    const mv = ev['game:moved'] || []; const s = [...mv].sort((a, b) => a - b);
    await cdp.send('HeapProfiler.collectGarbage');
    const m = await page.evaluate(() => ({ heap: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024) : -1, dom: document.getElementsByTagName('*').length, audio: window.__audio, iv: window.__iv.size }));
    const { result } = await cdp.send('Runtime.evaluate', { expression: 'window' }); const lw = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId });
    const { result: rd } = await cdp.send('Runtime.evaluate', { expression: 'document' }); const ld = await cdp.send('DOMDebugger.getEventListeners', { objectId: rd.objectId });
    const counts = await cdp.send('Memory.getDOMCounters').catch(() => ({}));
    const cur = await met(); const d = (k) => Math.round((cur[k] - prev[k]) * 1000); prev = cur;
    const lt = await page.evaluate(() => { const a = window.__long; window.__long = []; return [a.length, a.reduce((x, y) => x + y, 0)]; });
    const live = {}; for (const c of ['GainNode','AudioBufferSourceNode','OscillatorNode']) { const { result: pr } = await cdp.send('Runtime.evaluate', { expression: c + '.prototype' }); const { objects } = await cdp.send('Runtime.queryObjects', { prototypeObjectId: pr.objectId }); const { result: n } = await cdp.send('Runtime.callFunctionOn', { objectId: objects.objectId, functionDeclaration: 'function(){return this.length}', returnByValue: true }); live[c] = n.value; }
    const row = { g, live, task: d('TaskDuration'), script: d('ScriptDuration'), layout: d('LayoutDuration'), style: d('RecalcStyleDuration'), longN: lt[0], longMs: lt[1], moves: moveCount, ms: Date.now() - t0, movedAvg: (mv.reduce((a, b) => a + b, 0) / (mv.length || 1)).toFixed(2), movedP90: (s[Math.floor(s.length * 0.9)] || 0).toFixed(2), ...m, winL: lw.listeners.length, docL: ld.listeners.length, ...counts };
    rows.push(row); console.log(JSON.stringify(row));
  }
  sb.close(); await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
