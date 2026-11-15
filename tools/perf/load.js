// Server load test: R rooms (2R registered users) playing concurrently + L lobby/home watchers.
// Usage: node load.js <base> <rooms> <thinkMs> <lobbyWatchers> <durationSec> <pidOfServer>
// Env (#386): STORM_AT=<s into window> STORM_N=<sockets>  — disconnect + reconnect that many seated players in one tick
//             ROUTES_EVERY_MS=<ms>  — GET the heavy read routes round-robin during the window (signed in as user 0)
//             RTT_OUT=<file>        — dump every measured ack RTT (ms, one per line) for merging shards
const path = require('path');
const REPO = process.env.REPO;
const ioc = require(path.join(REPO, 'node_modules/socket.io-client'));
const fs = require('fs');
const [B, ROOMS = '100', THINK = '1000', LOBBY = '20', DUR = '30', PID] = process.argv.slice(2);
const N = 17;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const uniq = Date.now().toString(36).slice(-5);

async function register(i) {
  if (process.env.GUESTS && i > 0) { // #386: guests skip bcrypt (12 rounds) so thousands of players sign in fast; user 0 stays registered for the route poller
    const r = await fetch(B + '/api/auth/guest', { method: 'POST', headers: { origin: B } });
    if (!r.ok) throw new Error('guest ' + r.status + ' ' + (await r.text()));
    return { cookie: r.headers.getSetCookie().map(c => c.split(';')[0]).join('; '), user: (await r.json()).user };
  }
  const r = await fetch(B + '/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ username: `l${uniq}${i}`, password: 'Passw0rd!x', displayName: `L${i}` }) });
  if (!r.ok) throw new Error('register ' + r.status + ' ' + (await r.text()));
  const cookie = r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  return { cookie, user: (await r.json()).user };
}
function connect(cookie) {
  const s = ioc(B, { transports: ['websocket'], extraHeaders: { cookie, origin: B }, forceNew: true });
  return new Promise((res, rej) => { s.on('connect', () => res(s)); s.on('connect_error', rej); });
}
async function pool(n, conc, fn) { const out = []; let i = 0; await Promise.all(Array.from({ length: conc }, async () => { while (i < n) { const k = i++; out[k] = await fn(k); } })); return out; }

function wouldFive(board, x, y, c) {
  for (const [dx, dy] of [[1,0],[0,1],[1,1],[1,-1]]) {
    let n = 1;
    for (const s of [1, -1]) { let i = 1; for (;;) { const a = x + dx*i*s, b = y + dy*i*s; if (a<0||b<0||a>=N||b>=N||board[b][a]!==c) break; n++; i++; } }
    if (n >= 5) return true;
  }
  return false;
}
function pick(board, c) {
  for (let t = 0; t < 4000; t++) {
    const r = Math.min(N/2, 3 + t/150);
    const x = Math.floor(N/2 + (Math.random()*2-1)*r), y = Math.floor(N/2 + (Math.random()*2-1)*r);
    if (x<0||y<0||x>=N||y>=N||board[y][x]) continue;
    if (!wouldFive(board, x, y, c)) return [x, y];
  }
  return null;
}

const rtts = [], slow = [], victimRtts = [], stormed = new Set(); let w0g = 0; let moves = 0, games = 0, errors = 0;
const lobbyBytes = { patch: 0, n: 0, maxPatch: 0, home: 0 };
let measuring = false;

(async () => {
  const R = +ROOMS;
  console.log(`registering ${2 * R + +LOBBY} users…`);
  const users = await pool(2 * R + +LOBBY, 16, register);
  const sockets = await pool(2 * R, 32, (i) => connect(users[i].cookie));
  // watchers on lobby + home
  for (let i = 0; i < +LOBBY; i++) {
    const s = await connect(users[2 * R + i].cookie);
    s.emit('lobby:subscribe'); s.emit('home:subscribe');
    if (process.env.CHURN_MS) setInterval(() => { s.emit('lobby:unsubscribe'); s.emit('lobby:subscribe'); s.emit('home:subscribe'); }, +process.env.CHURN_MS * (0.5 + Math.random()));
    s.io.engine.on('data', (d) => { if (!measuring) return; const b = d.length; lobbyBytes.patch += b; lobbyBytes.n++; lobbyBytes.maxPatch = Math.max(lobbyBytes.maxPatch, b); });
  }
  console.log('creating rooms…');
  const tables = [];
  for (let r = 0; r < R; r++) {
    const a = sockets[2 * r], b = sockets[2 * r + 1];
    const roomId = await new Promise((res, rej) => {
      a.once('room:joined', (d) => res(d.roomId)); a.once('room:error', (e) => rej(new Error(JSON.stringify(e))));
      a.emit('room:create', { settings: { boardSize: N, timerMode: 'per_game', timerSeconds: 3600, ranked: false } });
    });
    await new Promise((res) => { b.once('room:joined', res); b.emit('room:join', { roomId }); });
    a.emit('room:sit', { slot: 1 }); b.emit('room:sit', { slot: 2 });
    tables.push({ a, b, ua: users[2 * r].user, ub: users[2 * r + 1].user, roomId });
  }
  await sleep(1000);
  for (const t of tables) {
    const st = { board: null, turn: null, colors: {} };
    const startGame = () => { t.a.emit('room:ready'); t.b.emit('room:ready'); };
    t.a.on('game:init', (d) => {
      st.board = Array.from({ length: N }, () => Array(N).fill(0)); st.turn = d.currentTurn;
      for (const p of d.players) st.colors[p.userId] = p.color === 'BLACK' ? 1 : 2;
      schedule();
    });
    t.a.on('game:moved', (d) => { st.board[d.y][d.x] = d.color === 'BLACK' ? 1 : 2; st.turn = d.nextTurn; if (!d.gameOver) schedule(); });
    t.a.on('game:ended', () => { games++; setTimeout(startGame, 300); });
    let seq = 0;
    function schedule() {
      const mover = st.turn === t.ua.userId ? t.a : t.b;
      const uid = st.turn;
      setTimeout(() => {
        const mv = pick(st.board, st.colors[uid]);
        if (!mv) { mover.emit('game:resign'); return; }
        const t0 = performance.now();
        mover.emit('game:move', { x: mv[0], y: mv[1], moveId: `${t.roomId}-${seq++}` }, (ack) => {
          if (ack && ack.error) { errors++; return; }
          if (measuring && stormed.has(mover)) { victimRtts.push(performance.now() - t0); return; } // a stormed socket's own move waits client-side for its reconnect — not server latency
          if (measuring) { const d = performance.now() - t0; rtts.push(d); moves++; if (d > 30) slow.push(((Date.now() - w0g) / 1000).toFixed(2)); }
        });
      }, THINK * (0.5 + Math.random()));
    }
    startGame();
  }
  console.log('warming up 5s…'); await sleep(5000);
  const storm = { at: 0, back: 0, ms: 0, errs: 0 };
  if (process.env.STORM_AT) setTimeout(() => {
    const victims = tables.slice(0, +process.env.STORM_N || 1000).map(t => t.b);
    for (const v of victims) stormed.add(v);
    storm.n = victims.length; const t0 = performance.now(); storm.at = (Date.now() - w0g) / 1000;
    for (const s of victims) s.disconnect();
    for (const s of victims) { s.once('connect', () => { if (++storm.back === victims.length) storm.ms = performance.now() - t0; }); s.once('connect_error', () => storm.errs++); s.connect(); }
  }, +process.env.STORM_AT * 1000);
  const routeStats = {};
  let routeTimer = null;
  if (process.env.ROUTES_EVERY_MS) {
    const C = users[0].cookie;
    const R = ['/api/home', '/api/shell', '/api/rankings?category=freestyle', '/api/rankings?category=freestyle&page=10', '/api/rankings?category=freestyle&q=ng',
      '/api/games', '/api/games?page=500', '/api/games?player=ng', '/api/games/stats', '/api/clubs', '/api/forum/threads', '/api/friends', '/api/notifications', '/api/dm'];
    let k = 0;
    routeTimer = setInterval(async () => {
      if (!measuring) return;
      const u = R[k++ % R.length], t0 = performance.now();
      try { const r = await fetch(B + u, { headers: { origin: B, cookie: C } }); await r.arrayBuffer(); const st = routeStats[u] || (routeStats[u] = { n: 0, max: 0, sum: 0, status: r.status }); const d = performance.now() - t0; st.n++; st.sum += d; st.max = Math.max(st.max, d); } catch { /* counted as missing */ }
    }, +process.env.ROUTES_EVERY_MS);
  }
  const cpu0 = PID ? fs.readFileSync(`/proc/${PID}/stat`, 'utf8').split(' ') : null;
  let w0 = Date.now(); w0g = w0; measuring = true;
  if (process.env.WAIT_SIGNAL) { // #386 watcher process: measure exactly the players' window — SIGUSR1 starts it, SIGUSR2 ends it
    measuring = false; lobbyBytes.patch = 0; lobbyBytes.n = 0; lobbyBytes.maxPatch = 0;
    console.log('waiting for SIGUSR1');
    await new Promise(r => process.once('SIGUSR1', r)); w0 = Date.now(); measuring = true;
    await new Promise(r => process.once('SIGUSR2', r));
  } else await sleep(+DUR * 1000);
  measuring = false;
  if (routeTimer) clearInterval(routeTimer);
  const secs = (Date.now() - w0) / 1000;
  const cpu1 = PID ? fs.readFileSync(`/proc/${PID}/stat`, 'utf8').split(' ') : null;
  const s = rtts.sort((x, y) => x - y), q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))] || 0;
  console.log(`== rooms=${R} think=${THINK}ms watchers=${LOBBY} window=${secs.toFixed(0)}s`);
  console.log(`moves=${moves} (${(moves / secs).toFixed(0)}/s) games=${games} errors=${errors}`);
  console.log(`ack RTT ms: p50=${q(.5).toFixed(1)} p90=${q(.9).toFixed(1)} p99=${q(.99).toFixed(1)} max=${q(1).toFixed(1)}`);
  if (cpu0) { const tk = (a) => +a[13] + +a[14]; console.log(`server CPU = ${((tk(cpu1) - tk(cpu0)) / 100 / secs * 100).toFixed(0)}% of one core`); console.log(`server RSS = ${(+cpu1[23] * 4096 / 1048576).toFixed(0)} MB`); }
  console.log(`per lobby watcher (raw ws bytes in): all ${(lobbyBytes.patch / +LOBBY / secs / 1024).toFixed(1)} KB/s (${lobbyBytes.n / +LOBBY} patches, max ${(lobbyBytes.maxPatch / 1024).toFixed(1)} KB), home ${(lobbyBytes.home / +LOBBY / secs / 1024).toFixed(2)} KB/s`);
  console.log('slow acks (s into window):', slow.slice(0, 40).join(' '));
  if (storm.at) console.log(`storm: ${storm.n} sockets at ${storm.at.toFixed(1)} s, all back in ${storm.ms ? storm.ms.toFixed(0) + ' ms' : 'NOT ALL (' + storm.back + ')'}, connect_errors=${storm.errs}, stormed players' own acks: n=${victimRtts.length} max=${Math.max(0, ...victimRtts).toFixed(0)} ms`);
  for (const [u, st] of Object.entries(routeStats)) console.log(`route ${u} status=${st.status} n=${st.n} avg=${(st.sum / st.n).toFixed(1)}ms max=${st.max.toFixed(1)}ms`);
  if (process.env.RTT_OUT) fs.writeFileSync(process.env.RTT_OUT, s.map(x => x.toFixed(2)).join('\n'));
  if (process.env.HOLD) await sleep(+process.env.HOLD * 1000);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
