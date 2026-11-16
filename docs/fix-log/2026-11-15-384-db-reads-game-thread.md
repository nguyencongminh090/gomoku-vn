# 2026-11-15 19:44 — #384 slow DB reads: query timing, covering index, 64 MB page cache, integrity report in a worker
## Prompt
Perf review item (ghi todo, làm tiếp từ #380): slow DB reads stall move acks — owner later: "Hoàn thiện bench test của 383 và 384."
## Root cause
better-sqlite3 is synchronous, so any read holds the game thread. Measured on a copy of `exports/vncaro-sim.db` (91 MB): `admin rating-integrity` computed inline held the thread 249–338 ms; the games list/count filtered on `ended_at` + player columns without a covering index; page cache was the 2 MB default.
## Fix
- `server/db/slow-query.js` (installed in `connection.js`): times get/all/run, logs > `SLOW_QUERY_MS` (5) once per 10 s per SQL, keeps top-offender stats.
- Migration `015_games_list_covering_index.sql`: `idx_games_ended_at` covers the list filter columns (plan: SEARCH … COVERING INDEX, no sort step).
- `connection.js`: `cache_size` 64 MB (env `SQLITE_CACHE_KB`); `mmap_size` left 0 (a failed mapped read is a crash).
- `RatingIntegrityService.reportJson()` + `workers/rating-integrity-worker.js` (read-only connection, one shared in-flight run, timeout); `admin.js` route uses it; report building in `utils/rating-integrity-report.js`.
- `server/scripts/slow-routes.js <db> [runs]`: every read route on a COPY of the DB → wall ms + longest event-loop stall + slow statements with plans. Branch `fix/384-db-reads-off-game-thread` (stacked on #383). Rankings cache NOT built: no rankings query exceeded 8 ms.
## Verification
- Tests: `db-read-perf-384` (index, plan, unchanged results, cache/mmap), `slow-query`, `rating-integrity-worker` (same report as sync path, fresh reads, shared run, read-only). `npm test`: 228 suites / 4000 pass.
- `slow-routes.js` on sim DB, 5 runs/route: longest game-thread stall ≤ 6.5 ms on every route (games stats worst); `admin rating-integrity` wall ~360 ms but stall 2–5 ms (inline: 249–338 ms). Migration 015 applies on the copy.
- Migration 015 (author bench, sim DB): stats 16.6 → 1.9 ms, name COUNT 15.9 → 3.2 ms, rare-name page 19.4 → 2.4 ms.
- Only statements > 5 ms: startup `DELETE FROM direct_messages WHERE created_at < ?` 13–14 ms (SCAN, once, not fixed) and rankings `scope=friends` 6.7–7.7 ms.
- cache_size 2 MB vs 64 MB on routes: within noise (routes already indexed); the 16.6 → 5.6 ms figure is from the author's unindexed-scan bench, not re-run. mmap_size not benched here.
- NOT verified: real-DB run, browser pass, load test with concurrent play.
