# B384 — Slow DB reads run on the game thread; pragmas for read-heavy pages
**Status:** ✅ FIXED 2026-11-15 — all sim-DB routes stall ≤ 6.5 ms; see docs/fix-log/2026-11-15-384-db-reads-game-thread.md
**Area:** `server/db/connection.js`, `server/db/rankings.js`, `server/db/games.js`, `server/db/user-search.js`, `server/routes/**`
**From:** perf review 2026-11-15   **Depends:** —

## Problem
better-sqlite3 is synchronous: any slow read (rankings, history, search, admin stats) stalls every move ack for its duration. Writes are fine (WAL, synchronous=NORMAL, `saveGame` 0.06 ms, nothing per move). `mmap_size=0`, `cache_size=16 MB`.

## Scope
1. Measure: log queries > 5 ms on a production-sized DB (`exports/vncaro-sim.db`), list the top offenders with plans.
2. Fix offenders by index / query shape first; cache rankings with invalidation on rating write.
3. Only if still > 10 ms: read-only connection in a worker thread for those routes.
4. Bench `mmap_size` / `cache_size` (method: `docs/knowledge/db-benchmarking-sqlite.md`).

## Don't
- No store migration (Postgres etc.) here — that is the size-L scale-out decision.

## Traps
- Memory says a "#260 slow queries" todo was recorded; `track.js 260` finds no index line — check before duplicating.

## Why this way
Notes: `docs/knowledge/db-benchmarking-sqlite.md`, SKILLS_TREE `db-sqlite-pragmas-wal-transactions`.

## Done when
- No query > 10 ms on the sim DB in the measured routes; numbers in the fix-log.
