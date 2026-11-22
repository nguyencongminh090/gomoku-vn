# 2026-11-22 — untracked RoomManager idle-scan interval held jest open
## Prompt
`npx jest --detectOpenHandles` reported "Timeout" handles; user: "fix it with unref".
## Root cause
`RoomManager` constructor (singleton created at `require`) starts `setInterval(_idleCleanup)` with no `unref()`. Every test that requires `server/socket/state` leaves an open handle -> "worker failed to exit gracefully". Prod unaffected (HTTP server keeps the process alive).
## Fix
`server/managers/RoomManager.js`: `unref()` the interval right after creation (guarded by typeof). `shutdown()` still clears it.
## Verification
New `server/tests/RoomManager-interval-unref.test.js` (hasRef() === false); fails without the fix (the jest process even hangs), passes with it. RoomManager.test.js 72 tests green.
