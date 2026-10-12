# 2026-10-12 15:10 — #249 star-shaped graph: false flags on real data
## Prompt
"làm tiếp điều chỉnh đồ thị hình sao" (after running the thresholds on the real DB).
## Root cause
Real data = 15 players around one hub account (172 games, 10 opponents); 6 of 8 players with >=10 games were flagged
"narrow opponents"/"gain from one" only because their main opponent is the hub. The population gate counted every account
that ever played (15 >= 10), though only 8 had enough games to compare, and nothing recognised a hub.
## Fix
`server/utils/rating-integrity.js`: gates use ACTIVE players (>= MIN_GAMES); `findHubs` (>= 8 distinct opponents and
>= 3x the active median) — a hub as most-played / top-gain opponent suppresses `narrow_opponents` / `gain_from_one`.
Pair skew and closed groups unchanged. Response gains `activePlayers`; hint text says "N players with 10+ games".
Branch fix/249-integrity-admin-only (stacked, unmerged). ?v bumped.
## Verification
- Real DB (read-only backup copy): player flags 6 -> 0, 1 lopsided pair kept, 0 groups.
- Kept tests: star graph, feeder still flagged beside a hub, active-player gate; hub test fails with hub rule disabled.
- Not verified: HUB_MIN_OPP / HUB_MULT on a bigger community; browser pass of the hint text (only i18n string changed).
