# B433 — jest "worker failed to exit gracefully": find and unref the remaining open handles
**Status:** ✅ FIXED 2026-11-22 — 3 handles fixed (fix-log 2026-11-22-433-jest-open-handles); full `jest --detectOpenHandles` 0 handles, `npm test` 4602 pass, no "failed to exit gracefully"
**Area:** `server/tests/**`, `client/tests/socket-client-server-disconnect.test.js`, singletons required at import time
**From:** user, 2026-11-22 (`npx jest --detectOpenHandles`)   **Depends:** — (RoomManager part already fixed, uncommitted: `server/managers/RoomManager.js:65`, fix-log 2026-11-22-roommanager-interval-unref)

## Problem
`npm test` still prints "A worker process has failed to exit gracefully" after the RoomManager interval got `unref()`.
First `--detectOpenHandles` run reported 9 `Timeout` handles: 6 from `RoomManager.js:59` (fixed), the other 3 not read yet;
one trace points at `client/tests/socket-client-server-disconnect.test.js:62`.
## Scope
1. Re-run `npx jest --detectOpenHandles` (takes > 2 min; run in background, read the output file) and list each remaining handle's source.
2. Fix each at the source: `unref()` for background timers in server singletons, `clearTimeout`/`close()` in the test's teardown otherwise.
3. One kept regression test per distinct source, one fix-log entry.
## Don't
- Don't add `--forceExit` or raise `testTimeout` to hide it.
- Don't change timer behaviour in prod code beyond `unref()` (the HTTP server keeps the process alive).
## Traps
- A test that leaks makes jest itself hang when run alone without the fix; run with `timeout 60`.
- Never `pkill -f`/`pgrep -af` with a pattern that appears in your own command line (it killed the shell once).
## Done when
- `npx jest --detectOpenHandles` reports no handles and `npm test` prints no "failed to exit gracefully".
