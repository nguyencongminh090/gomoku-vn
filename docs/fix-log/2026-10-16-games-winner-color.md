# 2026-10-16 — #257 games.winner_color with CHECK
## Prompt
Do #257
## Root cause
`games.winner` was an untyped overloaded column (colour, 'draw', legacy raw id, NULL); readers each re-derived the colour.
## Fix
Migration 004 (ALTER ADD COLUMN, no rebuild needed) adds `winner_color` CHECK IN ('BLACK','WHITE','DRAW') + backfill (colour/draw direct, legacy id via black/white_player_id). `saveGame` writes both; SQL readers (filters, stats, profile, club weekly board, backfill-ratings, `resolveWinnerSeat`) use `winner_color`; API output unchanged (`winner_color` stripped). `winner` kept (no contract step). Deviation from todo: no table rebuild — CHECK via ADD COLUMN is enough. Unresolvable rows stay NULL (1 live guest-vs-guest row with a raw guest id and no names).
## Verification
games-winner-color.test.js (all legacy shapes, CHECK, NULL), save-game.test.js (+guest/draw/interrupted); test helper trigger for suites inserting raw `winner`. npm test 3248 pass. Live DB counts: 192 BLACK / 154 WHITE / 18 DRAW, matches old winner; 1 NULL. Branch feature/257-winner-color, uncommitted.
