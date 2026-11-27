# F501 — Store the winning rule with each game
**Status:** OPEN
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
