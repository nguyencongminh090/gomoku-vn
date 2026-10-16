# B263 — Lobby critical path: start APIs earlier, preload fonts, explain 1.5 s idle gap
**Status:** OPEN — implemented on `fix/263-lobby-critical-path` (uncommitted), ?v=388; awaiting prod cold HAR
**Area:** `client/index.html`, `client/js/index-entry.js`, `lobby*.js`, `platform-shell.js`, `client/vendor/fonts/manrope/style.css`
**From:** HAR 22-09-34, 2026-10-16   **Depends:** #262 (measure after edge fix to separate effects)

## Problem
Waterfall (cold, ms): HTML done 1592 → first JS/CSS starts 3138 (1.5 s idle, cause unknown; no inline blocking script in
`index.html`) → JS/CSS wave ~560 → 5 APIs (`home`, `clubs/mine`, `notifications`, `rankings/me`, `admin/me`) only start at 3790
after DCL, ~630 ms each → Manrope woff2 start at 3777 after CSS. onLoad 4939. Also `/api/home` + `/api/notifications` poll
every 60 s at 1.0–1.4 s wait.

## Scope
1. Reproduce the 1.5 s gap (second HAR + Chrome trace); name the cause before fixing.
2. Start lobby APIs before module load completes (early fetch from HTML/`socket-early.js` style) and consume the result.
3. `<link rel="preload" as="font" crossorigin>` for the latin/vietnamese woff2.
4. Check whether the 60 s polling is needed at that cadence/size.

## Don't
- Don't change API shapes or auth; don't run requests before `requireAuth()` can bounce a guest.

## Traps
- Early fetch with a different credentials mode is not reused by later `fetch` → double request.
- Clock work files (`room-socket`, `game-ui`, `timer-sync-core`) are out of scope.

## Why this way
Serial JS→API→render is the largest controllable chunk (~0.6 s). Rejected: SSR the lobby (size L).
Knowledge: none.

## Done when
- Cold-load HAR shows APIs finish before `index-entry.js` finishes (revised 2026-10-17, user chose (a): +100 ms needs an inline script + CSP hash and gains no render time — APIs are off the critical path; module graph is); fonts requested with the CSS wave; gap explained in this file.
- `npm test` green; `?v=` one value.

## Result (2026-10-16) — fix-log `2026-10-16-lobby-early-api-font-preload.md`
- Gap: none in the page. RUM Navigation Timing: TCP connect 18→2396 ms (cold connection, network), responseEnd 3085, first subresource 3138; the HAR HTML row understated it.
- `api-early.js` + `GvnEarly.fetch` in 3 consumers; font preloads ×3; polling kept (≈250–300 B / 60 s, visible only).
- Local @150 ms RTT: APIs 975→340 ms = first JS + 1 RTT, done ~550 < index-entry.js ~970. Inline+CSP hash rejected (knowledge `static-assets-caching-csp-build` rule 8).
