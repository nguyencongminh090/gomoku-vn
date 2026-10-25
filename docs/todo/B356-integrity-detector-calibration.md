# B356 — Integrity detector: raise gain_from_one floor, narrow hub rule
**Status:** ✅ DONE 2026-10-25 — see docs/fix-log/2026-10-25-356-357-integrity-calibration.md (hub change had little effect on sim: 102 hubs)
**Area:** server/utils/rating-integrity.js (T constants, findHubs), server/tests/rating-integrity.test.js
**From:** features/integrity-calibration/findings.md, 2026-10-25   **Depends:** —

## Problem
On the 1351-player sim DB, `gain_from_one` flags 25 players, median 14 games; flags fall 28→13→6→2→1 as MIN_GAMES goes 10→40 (small-sample artifact; only 5 of 25 pass a permutation test p<.01). Hub rule exempts 102/559 active players (18%); disabling it adds 10 flags.
## Scope
1. `gain_from_one` needs ≥20 games (own constant; MIN_GAMES for `narrow_opponents` unchanged).
2. Hub needs ≥20 distinct opponents (not only ≥3× median).
3. Tests: weak-sample player not flagged; feeder pattern still flagged.
## Don't
- Don't touch ratings or the graph UI; don't tune on the real DB (16 players, 8 active → POP_MIN switches flags off).
## Traps
- Sim `rating_after` = next game's `before` (mixes categories), so gain is noisy there; re-check with `node tools/analyze-integrity.js [db]`.
## Done when
- Re-run on sim DB shows ~6 gain flags; tests pass; API `thresholds` shows the new constants.
