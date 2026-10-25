# 2026-10-25 16:05 — #356 #357 integrity detector calibration
## Prompt
"Do #356 + 357" (from features/integrity-calibration/findings.md).
## Root cause
`gain_from_one` fired at 10–14 games (top opponent trivially holds a big share); pair flag was a flat 85% one-sided count that ignored rating gap (80 of 116 pairs were plain skill gaps); hub rule `≥8 opponents` too loose.
## Fix
`server/utils/rating-integrity.js`: `GAIN_MIN_GAMES` 20, `HUB_MIN_OPP` 8→20, per-pair Elo-expected z from game-time `rating_before` (`PAIR_Z` 3), pair output gains `z` + `weakerWins`. Admin pair card shows z and a "weaker side wins" tag (i18n vi/en). Deviation from todo: none.
## Verification
+4 tests in `rating-integrity.test.js` (skill-gap pair not flagged; equal-rating skew flagged; upset tagged; 12-game farmer no gain flag; <20-opponent account not hub); `npm test` 3609 pass; cache-bust OK. Sim DB (`node tools/analyze-integrity.js`): flagged players 28→10, flagged pairs 116→9 (as predicted); hubs still 102 (those players really have ≥20 opponents) — hub rule effect small. Real DB (16 players) unaffected, no browser pass.
