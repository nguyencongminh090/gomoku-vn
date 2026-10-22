# B260 — Slow queries at scale: rankings search, player-name filter, rank count
**Status:** ✅ DONE (partial: search fixed; name filter kept, see fix-log)
**Area:** server/db/database.js (`searchRankings`, `buildGameFilters`, `getUserRanking`), routes/rankings.js, routes/games.js
**From:** EXPLAIN QUERY PLAN + timing run 2026-10-16 on a copy with 100k games / 20k rated users   **Depends:** —

## Problem
Fast now (365 games, 17 rated). At scale (ms per call, big vs small DB): `searchRankings` 90 vs 0.05 (ROW_NUMBER over the whole category per keystroke); player-name filter `LIKE '%x%'` 79 vs 0.19 (scans `idx_games_ended_at`); `getUserRanking` rank COUNT 7.3 vs 0.005. Everything else (recent games p1, rankings p1, history, user games, session lookup) stays < 0.2 ms with good plans. OFFSET 50000 = 2.8 ms (keyset not needed yet).

## Scope
1. Re-run the measurement first with `db-benchmarking-sqlite` method (script was scratchpad-only; add `server/scripts/bench-queries.js` that seeds a copy via CTE and prints plan + median).
2. `searchRankings`: filter by name first, then compute rank only for matches (rank = COUNT of better ratings, as `getUserRanking` does); keep result shape.
3. Player filter: decide with the route's callers — id-based (`player_games`) or keep LIKE but cap/require ≥2 chars; fix escape (see B259 step 6).
4. Only if still slow after 2–3: in-process cache for rank/search with TTL + invalidate on `rateGame`.

## Don't
- Don't add a cache before steps 2–3; don't change response shapes; don't use keyset until a deep-page need exists.

## Traps
- Synthetic data was uniform and hit only `su5`-style ids; re-measure with skewed data before trusting numbers.
- A cache is valid only while ONE process serves and writes; `scripts/backfill-ratings.js` and restores bypass invalidation.

## Why this way
`docs/knowledge/db-query-plan-index-tuning.md`, `db-benchmarking-sqlite.md`; reference SKILLS_TREE `software-architecture/items/data-inprocess-read-cache.md`, `database/items/db-keyset-pagination.md`.

## Done when
- Bench script committed; the three queries within ~5× of small-DB time at 100k/20k; jsdom/server tests for search + filter pass; `npm test` green.
