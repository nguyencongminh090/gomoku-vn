# B441 — e2e suite: 36/56 fail on stale specs (room URL wait, room tabs, banner text)
**Status:** ✅ FIXED 2026-11-24 — 56/56 Chromium pass (6.0 min, isolated `:3102`, throwaway DB, real DB sha256 unchanged); zero product regressions.
**Area:** e2e/helpers/room.ts, e2e/helpers/fixtures.ts, e2e/*.spec.ts (waitForURL), e2e/room-lifecycle, real-player-gameplay, reconnect-banner, spectator-join, seatcard-long-names, start-modal-board-centering, board-keyboard
**From:** e2e run 2026-11-24 after #440 (chromium, isolated :3102, throwaway DB)   **Depends:** —

## Problem
Run: 16 pass, 36 fail, 4 did not run (15.9 min). Not caused by #440 (room.html untouched; `.room-row`/`#room-list` kept).
1. 33 fails: `waitForURL(/room\.html\?id=/)` times out — creating from `#rooms` lands on
   `room.html?from=rooms&id=…` (#365, 6639a0ff, 2026-11-13 added `from`). Room loads fine (snapshot shows board).
2. room-lifecycle:96 + real-player-gameplay:34: `.tab-btn[data-tab="tab-users"]` exists but never visible (room layout redesign).
3. reconnect-banner:13: expects `/Mất kết nối/`, banner shows "Kết nối lại... (lần N)".

## Scope
1. One URL matcher in `e2e/helpers/room.ts` (`/room\.html\?(?:.*&)?id=/` or URL predicate), use it in every spec.
2. Re-run; then triage 2–3 against the current room UI / banner copy (spec stale vs real regression).
3. Re-run whole suite; update `e2e/README.md` "Known state".

## Don't
- Don't drop `?from=rooms` from lobby.js to please tests (it drives return-to-tab, #365).
- Don't raise `MAX_ROOMS_PER_IP`.

## Traps
- Masked failures: after (1) is fixed, specs that died at create may expose real bugs — triage each, don't bulk-update expectations.
- reconnect-banner may be a real #435-area regression (banner copy/state machine), not just copy.

## Done when
- Chromium suite green on an isolated server (README recipe), real DB checksum unchanged.
