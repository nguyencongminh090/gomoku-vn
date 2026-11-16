# B348 — Some server tests open the real server/db/gomoku.db
**Status:** ✅ FIXED 2026-10-23 (jest setupFiles temp DB + connection.js guard; db-isolation.test.js; npm test 3522 green)
**Area:** server/tests/{PrivateChatHandler,SocketHandler,flood-protection}.test.js (+ any others), server/db/connection.js
**From:** found while doing #344-#347, 2026-10-23   **Depends:** —

## Problem
With GOMOKU_DB_PATH unset, these suites load db/connection.js transitively (no better-sqlite3 / db mock), so `npm test`
opens and migrates the live DB file. 2026-10-23 16:31 it applied branch migrations 010-014 to the real DB (v9 → v14).
Found with a per-file sentinel GOMOKU_DB_PATH run (scan stopped early; list may be incomplete).

## Scope
1. Full per-file sentinel scan (`GOMOKU_DB_PATH=<tmp>/<file>.db npx jest <file>`; a created file = offender).
2. Make the suite hermetic by default: e.g. jest setupFiles sets GOMOKU_DB_PATH to a tmp file when unset, or connection.js refuses the default path under JEST_WORKER_ID.
3. Regression test: a test-run guard that fails if server/db/gomoku.db is opened.

## Don't
- Touch the live DB contents.

## Done when
- Sentinel scan creates nothing for every file; guard test kept; fix-log.
