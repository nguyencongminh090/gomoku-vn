// Real websocket check: node ws-check.js <base-url> <origin>   (run from the repo root: needs node_modules/socket.io-client).
// Guest login -> socket handshake with that Origin + the session cookie. Exit 0 = connected. A foreign origin must fail with AUTH_ORIGIN.
const { io } = require(process.cwd() + '/node_modules/socket.io-client');
const base = process.argv[2], origin = process.argv[3];
(async () => {
  const r = await fetch(base + '/api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json', origin }, body: '{}' });
  const cookie = (r.headers.getSetCookie() || []).map((c) => c.split(';')[0]).join('; ');
  console.log('guest', r.status, cookie ? 'cookie-ok' : 'NO-COOKIE');
  const s = io(base, { transports: ['websocket'], extraHeaders: { Origin: origin, Cookie: cookie }, reconnection: false });
  const done = (m, c) => { console.log(m); s.close(); process.exit(c); };
  s.on('connect', () => done('SOCKET CONNECTED ' + origin, 0));
  s.on('connect_error', (e) => done('CONNECT_ERROR ' + e.message, 1));
  setTimeout(() => done('TIMEOUT', 2), 8000);
})();
