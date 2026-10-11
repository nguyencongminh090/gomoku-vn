'use strict';
// B226 transfer audit harness. Counts raw engine.io frames per event per recipient.
// Usage: node scripts/measure-socket-transfer.js <port> <lobbyClients> <spectators> <moves>   (SAMPLES=1 prints one payload per event)
// Run ONLY against a throwaway server copy with its own DB (playwright-e2e-safety), started with
// AUTH_LIMITER_MAX=100000 MAX_ROOMS_PER_IP=1000 so N guests can log in from one IP.
const { io: ioClient } = require('socket.io-client');

const PORT = +process.argv[2] || 3150;
const N = +process.argv[3] || 50;
const SPEC = +process.argv[4] || 10;
const MOVES = +process.argv[5] || 30;
const BASE = `http://localhost:${PORT}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// phase → event → { packets, bytes, max }
const stats = {};
const samples = {};
let phase = 'init';
function rec(ev, bytes) {
  const p = (stats[phase] ||= {});
  const e = (p[ev] ||= { packets: 0, bytes: 0, max: 0 });
  e.packets++; e.bytes += bytes; if (bytes > e.max) e.max = bytes;
}

async function guest() {
  const r = await fetch(`${BASE}/api/auth/guest`, { method: 'POST', headers: { origin: BASE } });
  const cookie = (r.headers.getSetCookie() || []).map(c => c.split(';')[0]).join('; ');
  const body = await r.json();
  return { cookie, user: body.user || body };
}

async function connect(tag) {
  const g = await guest();
  const s = ioClient(BASE, { transports: ['websocket'], reconnection: false, extraHeaders: { cookie: g.cookie, origin: BASE } });
  s.tag = tag; s.cookie = g.cookie; s.user = g.user;
  await new Promise((res, rej) => { s.once('connect', res); s.once('connect_error', rej); });
  s.io.engine.on('data', (d) => {
    const str = typeof d === 'string' ? d : '';
    const bytes = 1 + (typeof d === 'string' ? Buffer.byteLength(d) : d.byteLength); // +1: engine.io '4' prefix stripped before 'data'
    const m = /^2\d*\["([^"]+)"/.exec(str);
    rec(m ? m[1] : (str[0] === '3' ? '(ack)' : '(ctl)'), bytes);
    if (m && !samples[m[1]] && bytes > 100) samples[m[1]] = str.slice(0, 700);
  });
  return s;
}
const waitFor = (s, ev, ms = 8000) => new Promise((res, rej) => {
  const t = setTimeout(() => rej(new Error(`${s.tag} timeout ${ev}`)), ms);
  s.once(ev, (d) => { clearTimeout(t); res(d); });
});

function report(title) {
  console.log(`\n### ${title}`);
  for (const [ph, evs] of Object.entries(stats)) {
    const rows = Object.entries(evs).sort((a, b) => b[1].bytes - a[1].bytes);
    const tot = rows.reduce((a, [, e]) => a + e.bytes, 0);
    console.log(`\n[${ph}] total ${tot} B`);
    for (const [ev, e] of rows) console.log(`  ${ev.padEnd(24)} pkts=${String(e.packets).padStart(6)} bytes=${String(e.bytes).padStart(9)} avg=${Math.round(e.bytes / e.packets)} max=${e.max}`);
  }
}

(async () => {
  // A. lobby connect burst: N clients on index.html (lobby:subscribe + home:subscribe)
  phase = 'A_lobby_connect_burst';
  const lobby = [];
  for (let i = 0; i < N; i++) {
    const s = await connect(`L${i}`);
    s.emit('lobby:subscribe'); s.emit('home:subscribe');
    lobby.push(s);
  }
  await sleep(2500); // let the 1.5 s online-users debounce flush

  // B. room lifecycle: create/join/sit/ready
  phase = 'B_room_setup';
  const p1 = await connect('P1'), p2 = await connect('P2');
  p1.emit('room:create', { settings: { boardSize: 15, ruleWall: false, rulePortal: false, timerMode: 'per_move', timerSeconds: 60 } });
  const room = await waitFor(p1, 'room:joined');
  p2.emit('room:join', { roomId: room.roomId }); await waitFor(p2, 'room:joined');
  p1.emit('room:sit', { slot: 1 }); await sleep(400);
  p2.emit('room:sit', { slot: 2 }); await sleep(400);
  p1.emit('room:ready'); await sleep(400);
  const initP = waitFor(p1, 'game:init');
  p2.emit('room:ready');
  const init = await initP;
  await sleep(600);

  // C. spectator join burst
  phase = 'C_spectator_burst';
  const specs = [];
  for (let i = 0; i < SPEC; i++) specs.push(await connect(`S${i}`));
  await sleep(2000); // their online-users flush lands in this phase too
  phase = 'C_spectator_burst';
  await Promise.all(specs.map(s => { s.emit('room:join', { roomId: room.roomId }); return waitFor(s, 'room:joined'); }));
  await sleep(1000);

  // D. moves
  phase = 'D_moves';
  const used = new Set();
  for (const w of init.walls || []) used.add(`${w.x},${w.y}`);
  const black = (init.players || []).find(p => p.color === 'BLACK');
  let turn = init.currentTurn;
  const byId = { [p1.user.userId]: p1, [p2.user.userId]: p2 };
  let made = 0, ended = false;
  p1.on('game:ended', () => { ended = true; });
  const zones = (init.firstMoveZones || []).map(z => `${z.x},${z.y}`);
  while (made < MOVES && !ended) {
    const mover = byId[turn] || (black && byId[black.userId]) || p1;
    let x, y, key;
    do {
      if (made === 0 && zones.length) { [x, y] = zones[Math.floor(Math.random() * zones.length)].split(',').map(Number); }
      else { x = Math.floor(Math.random() * 15); y = Math.floor(Math.random() * 15); }
      key = `${x},${y}`;
    } while (used.has(key));
    const res = await Promise.race([
      waitFor(mover, 'game:moved').then(d => ({ ok: true, d })),
      waitFor(mover, 'game:error').then(d => ({ ok: false, d })),
      new Promise(r => { mover.emit('game:move', { x, y }); }),
    ]);
    used.add(key);
    if (res.ok) { made++; turn = res.d.nextTurn; if (res.d.gameOver) ended = true; }
    await sleep(150);
  }
  console.log(`moves made: ${made}, ended early: ${ended}`);
  await sleep(1500);

  // E. room chat
  phase = 'E_room_chat';
  for (let i = 0; i < 10; i++) { p1.emit('chat:message', { text: `hello ${i} from the audit harness` }); await sleep(200); }
  await sleep(1000);

  // F. game end
  phase = 'F_game_end';
  if (!ended) { p1.emit('game:resign'); await sleep(2000); }

  // G. lobby churn: 10 lobby clients disconnect, 10 new connect
  phase = 'G_lobby_churn';
  for (let i = 0; i < Math.min(10, N); i++) { lobby[i].disconnect(); await sleep(100); }
  for (let i = 0; i < Math.min(10, N); i++) { const s = await connect(`R${i}`); s.emit('lobby:subscribe'); s.emit('home:subscribe'); lobby.push(s); await sleep(100); }
  await sleep(2500);

  // H. idle 10 s: steady-state traffic with nothing happening
  phase = 'H_idle_10s';
  await sleep(10000);

  if (process.env.SAMPLES) for (const [k, v] of Object.entries(samples)) console.log(`SAMPLE ${k}: ${v}`);
  report(`N=${N} lobby clients, ${SPEC} spectators, ${MOVES} moves`);
  for (const s of [...lobby, p1, p2, ...specs]) s.disconnect();
  process.exit(0);
})().catch((e) => { console.error(e); report('partial'); process.exit(1); });
