# 2026-11-15 20:14 — #385 DM pruneExpired seeks an index instead of scanning direct_messages
## Prompt
"Do #385"
## Root cause
`DELETE FROM direct_messages WHERE created_at < ?` (DmService.pruneExpired: boot, hourly, DM reads ≤ 1/min) had no index on
`created_at` → `SCAN direct_messages`, cost grows with the table, on the game thread.
## Fix
Migration 016 `idx_dm_created ON direct_messages(created_at)` → plan `SEARCH … USING COVERING INDEX idx_dm_created`.
Prune stays on the read path (throttle and TTL unchanged); no batching needed.
## Verification
Copy of exports/vncaro-sim.db, steady state (nothing expired), median of 30:
8.9k rows 0.30 → 0.006 ms; ×10 (89k) 7.2 → 0.006 ms. Insert (2000, tx) 5.6 → 6.4 µs median.
The ticket's 13–14 ms was the boot prune actually deleting the sim DB's rows (all older than 3 days) — a one-off delete.
`server/tests/dm-prune-index-385.test.js` (plan + expiry boundary; fails without 016). `npm test` 229 suites / 4003 pass.
