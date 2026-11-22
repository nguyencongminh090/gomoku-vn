# B436 — Upgrade socket.io stack: engine.io 6.6.9 has a high-severity DoS advisory
**Status:** ✅ DONE 2026-11-22 — merged dev a0fea7c6, deployed prod (socket.io 4.8.4, engine.io 6.6.12; ws-check CONNECTED, evil.example → AUTH_ORIGIN); [fix-log](../fix-log/2026-11-22-436-socketio-upgrade.md). Public `/vendor/socket.io` bundle is CF-edge cached (max-age 86400, no `?v=`) → 4.8.3 until expiry, protocol-compatible
**Area:** package.json, package-lock.json (socket.io, socket.io-client → engine.io, engine.io-client); served `/vendor/socket.io/socket.io.min.js`
**From:** #434 follow-up question "Should engine.io-client be updated?", 2026-11-22   **Depends:** #434, #435

## Problem
`npm audit` 2026-11-22: server `engine.io` 6.6.9 is in GHSA-2gc4-cqfq-p2gv "Engine.IO Protocol Revision
Mismatch DoS" (high, CVSS 7.5, AV:N/PR:N, CWE-248), range >=6.6.0 <6.6.10; fixAvailable. Latest: engine.io 6.6.12,
socket.io / socket.io-client 4.8.4, engine.io-client 6.6.8 (installed 4.8.3 / 6.6.6). Prod VPS runs the same lockfile.
Checked: engine.io-client 6.6.8 does NOT fix #434 (`_onError` still `transports.shift()`, `_filterUpgrades`
unchanged, no upgrade-retry option) — this item is security + currency only.

## Scope
1. Bump socket.io + socket.io-client to 4.8.4 (lock resolves engine.io >= 6.6.10, engine.io-client 6.6.8); `npm audit` clean for engine.io.
2. `npm test`; then lab reruns: `REUP_MS=3000 tools/perf/sticky-polling.js` (#434) and the #435 dead-socket lab (`tools/perf/viewer-dead-socket.js`).
3. Verify the served `/vendor/socket.io/socket.io.min.js` loads on room/index pages (real browser), websocket + polling fallback still connect.
4. Deploy (package-lock change → update-gomoku.sh runs `npm ci`); `ws-check.js` + origin refusal.

## Don't
- Don't remove the #434 re-upgrade or #435 liveness code — the bump fixes neither.
- Don't call engine.io internals (`_probe` etc.); 6.6.8 restructured the classes (SocketWithoutUpgrade/SocketWithUpgrade → Socket).

## Traps
- 6.6.8 changed `transports` option handling (names vs implementations): recheck `transports: ['websocket','polling']` + `tryAllTransports`.
- The bundle served to browsers comes from `socket.io/client-dist` (server package), not `socket.io-client`; both must move together.
- Advisory title only: impact (crash vs hang) unverified — read the GHSA before claiming it in the fix-log.

## Why this way
Patch-level bump inside 4.8.x; smallest change that clears the advisory. Rejected: forking engine.io-client for #434 (maintenance).

## Done when
- `npm audit` shows no engine.io advisory; `npm test` green; #434 + #435 labs pass; prod deployed and ws-check OK.
