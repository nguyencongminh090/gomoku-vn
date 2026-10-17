# B267 — e2e: 39 specs time out on hidden `#btn-create` (lobby home since #195)
**Status:** OPEN
**Area:** `e2e/**/*.spec.ts` (29 files), `e2e/helpers/`
**From:** #265 e2e run, 2026-10-17   **Depends:** —

## Problem
Full Chromium run (isolated server, temp `GOMOKU_DB_PATH`): 7 passed, 39 failed, 10 did not run, 44.8 min.
All 39 failures: `page.goto('/index.html')` then click/expect `#btn-create` → element `hidden`. Since #195
(2026-10-09, `lobby-home.js`) the create/join buttons only show on the `#rooms` screen
(`ACTION.rooms = ['btn-create','btn-join-code']`). Reproduced identically on unmodified `dev` (5d1522e), so
not caused by #265.

## Scope
1. One helper (e.g. `gotoRooms(page)` → `/index.html#rooms`) used by every spec that creates/joins a room.
2. Re-run the full suite; triage whatever fails after the fix separately.

## Don't
- Don't un-hide `#btn-create` on the home screen to satisfy tests (that is a product decision of #195).
- Don't raise `MAX_ROOMS_PER_IP` (asserted by `leave-then-create-room`).

## Traps
- `.gvn-lag` status banner can intercept clicks on `#btn-create` (seen in #265 browser pass).
- Server needs `JWT_SECRET` outside `.env` (worktrees), `CORS_ORIGIN`=test origin, `AUTH_LIMITER_MAX=5000`.

## Done when
- Full Chromium e2e run has no `#btn-create` timeouts; results recorded in e2e/README "Known state".
