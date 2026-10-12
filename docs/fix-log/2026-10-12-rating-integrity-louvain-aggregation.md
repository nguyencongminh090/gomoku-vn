# 2026-10-12 14:08 — #249 Louvain single pass split dense groups
## Prompt
"kiểm chứng Louvain" (verify the Louvain step of #249).
## Root cause
`groupSignals` ran only Louvain's local-moving phase. On seeded planted-partition graphs (5 groups x 6 players) it
ended below the planted partition's modularity in 6 of 20 graphs, splitting a 6-player group into 3+3. Each half
is under the group thresholds (size/games/internal share), so a real closed ring could go unflagged.
## Fix
`server/utils/rating-integrity.js`: `localMoving` + `louvain` (collapse communities into super-nodes, repeat until
nothing merges; self-loop = 2x internal weight). Still deterministic, ~270 ms for 2000 players / 120k rows. Thresholds
and the group rules untouched. Branch fix/249-louvain-aggregation off dev (feature code exists only there).
## Verification
- Scratch check: modularity >= planted in 20/20 graphs (was 14/20); row-order independent; ring of 8 flagged, 9 skipped,
  6-game ring skipped, leaky ring (40% outside) skipped, two rings bridged by 1 game stay separate.
- Kept regression test `louvain › recovers planted groups…` — fails with the aggregation level capped at 1 pass, passes now.
- Not verified: thresholds on real data; groups > 8 members are still ignored.
