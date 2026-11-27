# F501 — Store the winning rule with each game
**Status:** ✅ DONE 2026-11-27 (branch feature/500-501-replay-players-rule, uncommitted)
**Area:** server/db/schema.sql (games, tournament_games), saveGame, getGameById; client replay
**From:** features/replay-redesign, 2026-11-27   **Depends:** —

## Problem
`games` keeps `rule_wall`/`rule_portal` but not `settings.winningRule` (freestyle/standard/caro/renju).
So the replay cannot highlight the winning line by the game's rule; user decided 2026-11-27: no highlight.

## Scope
1. Persist `winning_rule` (nullable for legacy rows); return it from both replay endpoints.
2. Only if wanted then: highlight the winning line by that rule (board `setState({ winLine })`).
3. Show the rule as a meta chip.
## Done when
- New games return their rule on both replay endpoints; legacy rows return null.
## Result
- Migration `029_games_winning_rule.sql` (games + tournament_games, nullable). Written by saveGame / saveTournamentGame from `engine.settings.winningRule`; `getGameById` selects it, tournament read is `SELECT *`.
- Replay shows the rule as a meta chip (`rule.<x>` label, tooltip "Luật thắng"); null/unknown → no chip (room-ui's label helper defaults null to freestyle, so not reused).
- Scope 2 (win-line highlight) NOT done: user decision 2026-11-27, no highlight.
- Tests: both endpoints return the rule for new rows, null for legacy (`server/tests/replay-seats-rule-500-501.test.js`), chip in `client/tests/replay-page.test.js`.
