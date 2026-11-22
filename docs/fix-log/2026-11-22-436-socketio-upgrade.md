# 2026-11-22 14:59 — #436 socket.io stack upgrade (engine.io DoS advisory)
## Prompt
"do #436"
## Root cause
Dependency layer: lockfile pinned engine.io 6.6.9 (nested range of socket.io ^4.7.4), inside GHSA-2gc4-cqfq-p2gv
(>=6.6.0 <6.6.10, high). Bumping socket.io alone did not move it — the nested locked versions still satisfied
the ranges; needed `npm update engine.io engine.io-client …`.
## Fix
- package.json: socket.io ^4.8.4, socket.io-client ^4.8.4 (dev). Lock: engine.io 6.6.12, engine.io-client 6.6.8,
  socket.io-parser 4.2.7, ws 8.21.3. `npm audit`: no socket.io/engine.io/ws findings (other advisories untouched:
  qs, source-map-js, vite … — not in scope).
- No client/ change: our code only uses `engine.transport.name` + `engine.close()`; string `transports`
  + `tryAllTransports` still handled by 6.6.8. #434/#435 code untouched.
- Kept test: server/tests/socketio-versions.test.js (engine.io loaded by socket.io >= 6.6.10; served
  client-dist version == socket.io-client version).
## Verification
- `npm test` 271 suites / 4653 tests green (incl. new suite 3/3).
- Lab, isolated server :3117 (temp DB): `REUP_MS=3000 tools/perf/sticky-polling.js` → ws broken = polling,
  re-upgrade to websocket without reload. `viewer-dead-socket.js` (bhproxy) → forced close 7.7 s, connect 8.4 s,
  own chat delivered once (was 8.7 s).
- Chromium, logged-in index: `/vendor/socket.io/socket.io.min.js` = v4.8.4, transport websocket; ws blocked →
  polling, connected. Room page covered by the sticky-polling lab.
- NOT done: prod deploy (step 4), ws-check.js + origin refusal on prod.
