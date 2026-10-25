# B357 — Integrity pairs: Elo-expected z-score, "weaker side wins" tag
**Status:** ✅ DONE 2026-10-25 — see docs/fix-log/2026-10-25-356-357-integrity-calibration.md (hub change had little effect on sim: 102 hubs)
**Area:** server/utils/rating-integrity.js (pairSignals), admin integrity API + tab (pairs list)
**From:** features/integrity-calibration/findings.md, 2026-10-25   **Depends:** —

## Problem
The flat 85%-one-sided pair flag yields 116 pairs on the sim DB; 80 have |z|<2 against Elo-expected score (plain skill gap). Only ~9 have |z|≥3 (chance ≈1.3 of 499 tests).
## Scope
1. Per pair: z = (wins + draws/2 − Σp) / √Σp(1−p), p = logistic((r_self − r_opp)/400) from `rating_before` at game time (opponent's row via game_id).
2. Flag only skew ≥ .85 AND |z| ≥ 3; show z and a "weaker side wins" tag; keep PAIR_MIN 6.
3. Tests: skill-gap pair not flagged; upset pair (weak side 8–0) flagged.
## Don't
- Don't use burst-in-24h as a signal (381/499 pairs, session play). Don't build the permutation test in the request path.
## Traps
- Normal approximation is rough at n=6–10; `rating_before` of the opponent may be missing → fall back to equal rating.
## Done when
- Sim DB: ~9 pairs flagged incl. b04a7c vs e33079 (38–4); tests pass.
