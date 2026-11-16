# F405 — Engine lease, socket protocol, file route, client host
**Status:** ✅ DONE 2026-11-16 (branch feature/405-engine-lease-socket, uncommitted; flag ENGINE_LEASES_ENABLED off)
**Area:** `server/engine/LeaseManager`, `server/socket/handlers/EngineHandler.js`, `server/routes/engine-files.js`, `client/js/engine/engine-host.js`
**From:** features/rapfi-engine (2026-11-16)   **Depends:** F404 (transport interface), F406 (files)

## Problem
Engine runs on the client (WASM). Server must grant files per game, drive jobs, and revoke at game end. Client is untrusted.
Design: [backend-design](../../features/rapfi-engine/backend-design.md) §3–§5, §8.

## Scope
1. `LeaseManager`: grant/heartbeat/TTL/revoke, one active lease per user+purpose, global cap, HMAC short-TTL token + server denylist.
2. Socket events `engine:request|ready|job|line|done|stop|end|error` (§4); ownership check, rate limits, size caps, one job in flight.
3. File route with token check, content-hash immutable cache.
4. `ClientWasmTransport` + client `engine-host.js` (worker relay only, reuse GomokuBoardSite `engine.worker.js`); capability probe (SIMD, SharedArrayBuffer).
5. Bad/slow client: deadline + grace → fallback move, end lease after repeats.

## Don't
- No room clock events changes; no protocol logic on client; do not enable COOP/COEP site-wide before checking CSP/avatars/CDN.

## Traps
- Issued token stays valid until expiry; keep TTL in minutes + denylist.
- Single-thread build can't STOP: use node/time budgets or terminate worker.
- Multi-thread build needs cross-origin isolation (site-wide blast radius): start single.

## Why this way
Lease/Resource-pool + state machine; knowledge: `be-realtime`, `realtime-reliability-resync`, `static-assets-caching-csp-build`.

## Done when
- Tests: lease TTL/revoke, foreign-socket rejection, stale job drop, illegal-move fallback; jsdom host test.
- Real-browser pass: engine loads, answers a job, is torn down at game end.

## Result (2026-11-16)
- Server: `engine/LeaseManager.js`, `transports/ClientWasmTransport.js`, `engine/build.js`, `socket/handlers/EngineHandler.js` (hooks `setAuthorizer`, `onLeaseReady`, `getService`, `revokeForGame`), `routes/engine-files.js`; worker CSP in `config/csp.js`. Client: `js/engine/engine-host.js`, `js/engine/engine.worker.js`.
- Tests: `engine-lease`, `engine-handler` (+route), `csp`, jsdom `engine-host`; full suite 4202 green.
- Real browser: `tools/engine-browser-check.js` (own port + temp DB) — Chromium 1243 and Firefox 1538: 9/9 (load, analysis PV, opponent move, forced stop → respawn → next job, game-over revoke, no CSP errors).
- Deviations: (1) lease dies with its socket, no grace — host re-requests after reconnect (files cached in page); (2) revocation = live-lease map checked by the file route (stronger than a denylist); (3) token in `X-Engine-Token` header, stable URL, `private, immutable` cache — page fetches, worker gets buffers (glue via blob:); (4) `engine:job` carries `commands[]`: WASM runs ONE command per `sendCommand` and a split `YXBOARD…DONE` block makes it exit(0), so the server joins blocks; (5) line batches every 100 ms or 64 lines; a cap/rate violation fails the job (no silent drop), `engine:done` exempt from the rate bucket; (6) no authorizer = every request refused.
- Volume (heaviest: analysis nbest 8 / 5M nodes, 7.3 s): 1755 lines, peak 12 batches/s → caps 12000 lines/job, 30 events/s.
- Open for #407: who may lease (guest/member/purpose), wiring `revokeForGame` to game end, difficulty table; each stop costs deadline + 1.5 s grace (single build never answers STOP).
