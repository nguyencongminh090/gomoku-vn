# B385 — DM `pruneExpired` scans all of `direct_messages` (13–14 ms) on the game thread
**Status:** ✅ FIXED 2026-11-15 — migration 016 idx_dm_created; fix-log 2026-11-15-385-dm-prune-index.md
**Area:** `server/managers/DmService.js:39` (`pruneExpired`), `server/index.js:301-302`, `server/db/migrations/` (new)
**From:** #384 measurement 2026-11-15 (`slow-routes.js` on `exports/vncaro-sim.db`)   **Depends:** —

## Problem
`DELETE FROM direct_messages WHERE created_at < ?` plans as `SCAN direct_messages` (only `idx_dm_conv`, `idx_dm_unread` exist): 13–14 ms on the sim DB. Runs at boot, hourly, AND from DM reads (throttled ≤ 1/min, `PRUNE_EVERY_MS`) — so it recurs during play and holds every move ack for its duration.

## Scope
1. Re-measure on sim DB + a scaled-up copy (rows ×10) to see growth; check `PRUNE_EVERY_MS` / TTL values.
2. Index on `created_at` (new migration) and re-check the plan; if still slow, delete in batches (`LIMIT`) or move the prune off the read path to the hourly timer only.
3. Test: expiry behaviour unchanged (rows older than TTL gone, newer kept).

## Don't
- Don't change `DM_TTL_MS` or what counts as expired.

## Traps
- An index on a table written on every DM adds write cost — measure the insert too.
- Reads call prune "so expiry never lags by more than a minute": dropping it from reads changes that guarantee; keep it unless reads also filter by TTL.

## Why this way
Same method as #384 (index / query shape first). Notes: `docs/knowledge/db-benchmarking-sqlite.md`.

## Done when
- Plan uses an index or batches; the statement ≤ 5 ms on sim DB; numbers in the fix-log; regression test kept.
