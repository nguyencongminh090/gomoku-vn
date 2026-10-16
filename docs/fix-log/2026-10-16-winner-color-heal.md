# 2026-10-16 — #257 follow-up: migration 006 heals winner_color rows 004 missed
## Prompt
fix issue 1 in the migration (review of #257: 004 backfill narrower than resolveWinnerSeat)
## Root cause
004 mapped `winner` only by colour/'draw'/player id. `resolveWinnerSeat` also resolves raw-name winners and guest-by-elimination
(one seat has no player id), so such legacy rows showed a winner in the API but stayed NULL and fell out of SQL stats/`result=win`.
## Fix
New `migrations/006_games_winner_color_heal.sql`: for NULL `winner_color` with a raw `winner`, same order as `resolveWinnerSeat`
(name, then elimination). Deviation: 004 not edited — shipped migrations are immutable (`migrate.js` header) and live is already at v5.
## Verification
games-winner-color.test.js: name/elimination rows in the full run, plus a DB migrated to v5 then healed by 006. npm test 3260 pass.
Live DB copy: 006 changes 0 rows (the only NULL is guest-vs-guest, names 'Unknown') — 192/154/18/1 unchanged.
