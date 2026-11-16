# Integrity detector calibration — findings (2026-10-25)

Data: `exports/vncaro-sim.db` (live-vncaro games; `rating_before` = the live site's per-game Elo, **not** a replay;
`rating_after` = next game's `before`, so gain mixes in dropped-category games → `gain_from_one` is noisier than on a
real DB). Script: `node tools/analyze-integrity.js [db]` (read-only). Real `gomoku.db` NOT read. 1351 players, 559 active.

## Results (detector `rating-integrity.js`, defaults)
| Check | Result | Chance baseline |
|---|---|---|
| Flagged players | 28 (25 gain_from_one, 5 narrow) | — |
| Skewed pairs (≥6 g, ≥85%) | 116 (=API); 80 of them have \|z\|<2 vs Elo-expected → skill gap | — |
| Closed groups | 0 | — |
| `MIN_GAMES` 10/15/20/30/40 → flagged | 28 / 13 / 6 / 2 / 1 | flags vanish as sample grows = small-sample artifact |
| Hubs | 102 of 559 active (18%) — exemption too wide; hub rule off → gain flags 25→35 | — |
| Pair Elo-z \|z\|≥3 (499 pairs tested) | 10 | ~1.3 |
| Pair Elo-z \|z\|≥4 | 2 | ~0.03 |
| Upset-skewed pairs (≥85%, weaker side wins) | 8 (4 with \|z\|≥3), by rating at game time | — |
| gain_from_one, permutation p<.01 (25 tests) | 5 | ~0.25; median flagged player 14 games |
| Alternating-result pairs | 4 | — |
| ≥5 games in 24 h | 381/499 pairs → **non-signal** (session play; timestamps are minute-coarse) | — |

Normal approximation is rough at n=6–10. Earlier "135 pairs / ~15 upset" used a different definition (current rating) — superseded.

## Review candidates (ids abbreviated)
- `b04a7c` beats `e33079` 38–4 (42 g) though b04a7c is 41% overall (rated ~1055 vs 1211): z=4.6, weaker side dominates; both are hubs.
- `f8fb6f` 0–16, 15 of them vs `fec25b`; `568433` 18–0 vs `8b88a2` (a 26%-win player) — likely newbie/weak-player farming, check.
- Overall: weak-but-real excess over chance (10 vs 1.3), no group structure → **no evidence of organised collusion**.

## Options (record only; nothing built)
1. **Smaller:** raise `MIN_GAMES` for `gain_from_one` to 20 (flags 25→6) + narrow hub rule (e.g. hub needs ≥20 opponents). Cost: 2 constants; reversible; may miss fast farming.
2. **Add Elo-expected z to pairs:** flag only \|z\|≥3 AND skew≥.85; show z and "weaker side wins" tag. Cost: moderate (pure fn + tests); cuts 116→~9; reversible.
3. **Permutation p for gain_from_one:** most principled, but 2000 shuffles/player is heavy for request path → only for already-flagged players or offline job.
Recommended: 1 + 2 (shown as sortable columns, thresholds in API `thresholds`). Pre-mortem: real DB is small (few active players) so z-test power is low and POP_MIN logic dominates; sim `rating_after` bias hides true gain; a feeder that plays many opponents becomes a "hub" and exempts those it feeds.
Knowledge: no SKILLS_TREE note on anomaly/collusion statistics (find returned unrelated) → decision rests on the measurements above.
Verify: rerun script on real DB read-only; add unit tests with synthetic feeder (weak player 0–15 vs one) and a skill-gap pair that must NOT flag.

## Real DB (read-only copy, 2026-10-25)
16 players, 8 active (<POP_MIN 10): player/group flags are off by design; 1 skewed pair, explained by Elo (|z|<2). Too small to calibrate or detect anything → thresholds are tuned on the sim DB only. Recorded as #356, #357.
