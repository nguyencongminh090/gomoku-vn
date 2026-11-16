# F405 — Engine lease, socket protocol, file route, client host
**Status:** OPEN
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
