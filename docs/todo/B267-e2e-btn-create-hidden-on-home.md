# B267 — e2e: 39 specs time out on hidden `#btn-create` (lobby home since #195)
**Status:** ✅ DONE 2026-10-17 — no #btn-create timeout; layout specs split to #268
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

## Progress 2026-10-17
- 26 specs/helpers now `goto('/index.html#rooms')` (no new helper; literal URL). reconnect-banner + websocket-first-transport left on home (no room actions).
- Subset run (resign-flow, draw-offer, undo, leave-then-create-room, lobby-patch; port 3917, temp DB): `#btn-create` no longer times out. Remaining failures are later steps: undo/resign/draw wait on `#slot-1 .slot-card__clickable` (stale selector?); leave-then-create expects 3 rooms in lobby list after bounce from failed create. Triage separately.
- Port 3000 was busy (user server) -> use `PORT`, `CORS_ORIGIN`, `PLAYWRIGHT_BASE_URL`, `PW_CHROMIUM_PATH=~/.local/share/ms-playwright/chromium-1243/chrome-linux64/chrome`.

## Triage: slot selector (2026-10-17)
- Root cause: #216 (404ef4d) replaced `#slot-N .slot-card__{clickable,name,stand,empty}` with `.seatcard` cards (`#seatcard-top/bottom`, `[data-slot=N]`, `.seatcard__sit/__name/__stand`, `.seatcard--empty`). Specs fixed (sed, 14 files); `slot-card-stand-inline-touch-target` also needed `goto('#rooms')` before `#btn-create`.
- Verified: undo/resign/draw now seat both players and start the game (2 passed in subset).
- Next layers (separate, not done): (1) `RoomState.boardRenderer.geo.{cellSize,originX,originY}` is gone; geo is now `{m,n,vx,vy,VW,VH}` in SVG units, P=40, use `_cellFromClient` inverse -> 31 uses in 9 specs (undo, draw-offer, wall-first-move-zone, real-player-gameplay, swap2-opening, spectator-join, game-*, turn-watchdog) -> one shared `clickCell` helper. (2) resign-flow: `.btn-game--resign` not found (selector renamed). (3) leave-then-create: lobby list after failed-create bounce.

## Triage: board/actions (2026-10-17)
- `e2e/helpers/board.ts` `cellPosition(page,x,y)` (inverts `_cellFromClient`; waits for `geo`) replaces the dead `geo.{cellSize,originX,originY}` reads in 9 specs. `e2e/helpers/actions.ts` `act()`/`confirmAct()` for `.act[data-action=…]` (resign/draw are two-tap, #216); `.btn-game--*`/`.btn-draw-*` -> `data-action` (undo uses doUndoAccept/Decline). swap2: `#turn-bar`/`#tb-*` -> `.seatcard__clock`, `.seatcard--turn[data-clock]`.
- Subset (undo, draw-offer, swap2, resign-flow, move-validation, rematch-overlay): 15 passed. Open: leave-then-create-room lobby list; full-suite run; README "Known state".

## Full run 2026-10-17 (Chromium, isolated server :3917, temp DB, branch fix/267-e2e-gotorooms)
Before: 7 pass / 39 fail / 10 not run. After helpers: **41 pass / 15 fail / 0 not run (17 min)**; 9 of the 15 then fixed to get past `#btn-create` (3 specs lacked `goto('#rooms')`) but fail further on layout. No `#btn-create` timeout remains.
Remaining 15 (+ the 9 above), none is a `#btn-create` problem:
- **Stale pre-#216 layout assertions (need rewrite = product-aware, own item):** drawer-rail-not-displaced (2), start-modal-board-centering (4, drawer/sheet gone), topnav-minimal-mobile (2), strip-clock-mobile (`#players-strip` gone), slot-card-stand-inline-touch-target (✕ is 32px now, test wants <32).
- **flood-protection (2):** `AUTH_INVALID` from raw socket.io-client probes -> cookie/JWT handshake, unrelated to #195/#216; investigate separately.
- **Lobby list (3):** leave-then-create-room (list shows 0 after bounce), lobby-patch-incremental-render (`waitForEmptyLobby` never reaches 0 in 90 s), room-ghost-viewers-cleanup (row survives grace). Likely one cause: lobby `.room-row` rendering/subscription on `#rooms`; check first.

## Triage: lobby list + flood-protection (2026-10-17)
- leave-then-create-room: room-socket redirects (kick/destroy/create-rejected/leave) go to `index.html` = lobby HOME (no room list, lobby unsubscribed, B229) -> test counted 0 rows. Fixed in the spec (`goto('#rooms')` after the bounce). Product note: bounce lands on home by #195 design; not changed.
- lobby-patch-incremental-render, room-ghost-viewers-cleanup: pass alone (ghost row gone after ~20 s); the full run failed them from rooms leaked by earlier failing specs (`waitForEmptyLobby` never hit 0). Order-dependent, not a product bug; re-check after the layout specs are rewritten.
- flood-protection: NOT a bug. Spec signs JWTs with the test process's `config.JWT_SECRET`; my server ran with another `JWT_SECRET` -> `AUTH_INVALID`. Same secret on both -> 2 pass. Recipe added to e2e/README.
- Left: 10 stale pre-#216 layout specs -> recorded as #268.
