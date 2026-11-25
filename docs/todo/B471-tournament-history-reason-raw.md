# B471 — Tournament games history shows raw reason codes ("won — win")
**Status:** OPEN
**Area:** client/js/tournament-detail.js (GAME_REASON_KEY, gameResultText), server/managers/GameEngine.js
**From:** #466 follow-up verification 2026-11-25   **Depends:** —

## Problem
`GameEngine` stores reason `'win'` (five in a row) and `'agreement'` (draw), but `GAME_REASON_KEY`
maps `normal`, `draw_agreement`, `resign`, `timeout`, `board_full`. Unknown codes fall through as
raw text: "Trúc Mai won — win", "Draw — agreement" (vi too). Also on origin/main.

## Scope
1. Map the codes the engine really writes (`win`, `agreement`) to existing history keys; keep old ones.
2. jsdom test for each stored reason; check other pages that render tournament_games reasons.

## Done when
- History shows "5 liên tiếp" / "Five in a row" and the draw reason text in both languages.
