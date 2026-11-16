# F408 — Multi-thread engine variant (cross-origin isolated pages)
**Status:** ✅ CLOSED 2026-11-16 (merged to dev 7dd8fbd9, pushed; no page isolated by default)
**Area:** `server/engine/build.js`, `ClientWasmTransport`, `EngineHandler`, `server/config/csp.js`, `client/js/engine/*`
**From:** user 2026-11-16 "Support multithread engine."   **Depends:** F405, F406 (multi build in `server/engine-files/<id>/`)

## Problem
#405 serves only the single-thread build: no real STOP (stop = terminate + respawn, costs deadline + 1.5 s) and one core.
Multi build needs `SharedArrayBuffer` → the PAGE must be cross-origin isolated (COOP same-origin + COEP require-corp).

## Scope
1. Build resolver exposes `single` + `multi`; request `variant:'multi'` granted when present, else downgraded to single.
2. Isolation opt-in per page: `ENGINE_ISOLATED_PAGES` (default empty) → COOP/COEP on those HTML responses; engine worker response always COEP-compatible.
3. Host: `crossOriginIsolated && SharedArrayBuffer` → ask multi; worker spawns pthreads from the glue blob (header-gated glue cannot be re-fetched by pthreads).
4. Threads: client reports `hardwareConcurrency`; server clamps and prepends `INFO THREAD_NUM n` per job (protocol stays server-side).
5. Stop: multi → server sends `YXSTOP` command via `engine:stop`, move line still arrives; single unchanged.

## Don't
- No COOP/COEP site-wide; no page enabled by default (Cloudflare beacon is cross-origin, Safari lacks `credentialless`).

## Done when
- Tests: variant grant/downgrade, THREAD_NUM clamp, multi stop path, isolation headers, jsdom host multi path.
- Real browser (Chromium + Firefox): isolated page loads multi, stop answers with a move, speed single vs multi recorded.

## Result (2026-11-16)
- `build.js` variants single+multi; request `variant:'multi'` → granted only if built, else ack `single`. `ClientWasmTransport({variant})`: multi prepends `INFO THREAD_NUM n` (n = reported cores − 1, 1..8), stop = `engine:stop {command:'YXSTOP'}`; unanswered → reset sends one `{hard:true}`. `isolationMiddleware` (csp.js) + `ENGINE_ISOLATED_PAGES`. Worker: pthreads (`new Worker(…,{name:'em-pthread'})`) redirected to the glue blob URL; `instantiateWasm` passes the module on.
- Batches raised to 256 lines (multi hit 20 batches/s at 64) → measured peak 9/s.
- Real browser (`tools/engine-browser-check.js --multi --heavy`), 8-core host, 7 threads, analysis nbest 8 / 5M nodes:
  | | single nps | multi nps | stop (500 ms deadline) |
  |---|---|---|---|
  | Chromium 1243 | 0.70 M | 2.80 M (4.0×) | 2003 ms TIMEOUT → 504 ms with result |
  | Firefox 1538 (headless) | 0.14 M | 0.37 M (2.7×) | 2002 ms → 508 ms |
- Not verified: Safari/WebKit, phones, production Cloudflare beacon under COEP (why no page is isolated by default). A real isolated page is the analysis/replay surface (not built yet).
