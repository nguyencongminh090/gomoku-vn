# 2026-11-24 03:10 — untracked room scorecard "#1 – #1" + crosstable
## Prompt
"one leave -> score is duplicate (#1 - #1)… scorecard: current playing pair, 0-0 if one leaves. score-games: no Games 1 2 3, store history of players + total score… crosstable sorted (#1 most score)"
## Root cause
`RoomStage.renderScores` filled an empty seat from `gameLog[last].players[idx]`; after a leave that ghost could be the player still seated → same name on both sides.
## Fix
`client/js/room-stage.js`: seats = seated users only (empty → "—", 0–0); new `buildCross` merges `scoreHistory` + `scoreTable` into a points-sorted crosstable (win 1, draw ½; players appear after finishing a game); per-game rows + live row + MutationObserver removed. i18n `room.cross_pts` (game_* keys dropped), CSS for the table. Branch `fix/scorecard-crosstable`. `cache-bust --write` run.
## Verification
3 new jsdom tests (pair, one-left, sorted/new player) in room-stage.test.js; obsolete row tests removed; `npm test` 4657 pass. Not verified: real browser / phone width. `scoreHistory` is capped at 20 pairs, so very old pairs drop from totals.
