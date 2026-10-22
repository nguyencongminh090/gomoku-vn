# #260 — rankings search at scale
**Root cause:** `searchRankings` ran `ROW_NUMBER()` over the whole category (every rated user) for each query, then filtered by name.
**Fix:** match names first (scan `users`, probe `ratings` PK), page, then rank only the page rows by COUNT of better ratings (same tie rule as `getUserRanking`). Shape unchanged.
**Bench:** `node server/scripts/bench-queries.js` (temp DB, 100k games / 20k users, ANALYZE, median of 21). Search q=`an`: 39 → 3.9 ms; q=`user1234` (11 hits): 34 → 32 ms (cost ≈ 2 ms per hit's rank count); small DB ≈ 0.1 ms.
**Not changed (deviation from todo step 3):** game player-name filter stays `LIKE '%x%'` on name columns — list 4 ms (early exit on `ended_at` index), count 10–14 ms at 100k. Names are snapshots (guests, renames), so id-based filtering would change results; only FTS/trigram would remove the scan. Not worth it at this size. No cache added (step 4).
**Regression test:** existing `server/tests/rankings-route.test.js` search cases (true rank, threshold, wildcard escape) pass unchanged.
