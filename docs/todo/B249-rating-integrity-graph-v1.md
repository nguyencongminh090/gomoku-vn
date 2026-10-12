# B249 — Rating integrity v1: collusion signals + admin list (read-only)
**Status:** OPEN — built + browser-verified 2026-10-12 on feature/249-rating-integrity, uncommitted
**Area:** server/db/database.js (queries), server/routes/admin.js + admin page, tests; new pure module for metrics
**From:** features/rating-integrity-graph (decisions 2026-10-12)   **Depends:** —

## Problem
Ratings can be inflated by repeat opponents, feeder accounts or closed rings; nothing detects it.
## Scope
1. Pure metrics module over ranked games (nodes = players, edges = ranked games per pair): opponent entropy /
   unique opponents, top-opponent share of net rating gain, pair win asymmetry.
2. Louvain community detection last (closed groups); thresholds scale with population size.
3. Admin endpoint + page section listing flagged players/pairs/groups with reason and numbers, computed on demand.
4. Admin-only note; friend/club relation shown as annotation, not exemption.
5. Tests on synthetic rings, broad players, sparse early graph.
## Don't
- No rating/ranking effect, no new table/migration, no IP/device, no pair damping (Q2, Q4 deferred).
## Traps
- Sparse graphs look "closed" early; a selective player is not necessarily cheating.
## Why this way
Flag for human review first; graph shows pattern, not intent. Knowledge: none consulted yet.
## Done when
- Metrics tests pass on synthetic data; admin list renders; `npm test` green; real-browser pass of admin page.
