# B430 — game ending mid-opening (Swap2 / Renju) stores winner as a raw user id
**Status:** ✅ FIXED 2026-11-21 — see docs/fix-log/2026-11-21-430-opening-end-record-colours.md
**Area:** server/managers/GameEngine.js, server/socket/handlers/GameHandler.js, server/socket/handlers/TournamentMatchHandler.js
**From:** found 2026-11-21 building #427; user 2026-11-21 "Sửa cho cả Swap2 + Renju"   **Depends:** —

## Problem
Resign / timeout / disconnect before the opening assigns colours: players' `color` is null, so
saveGame / saveTournamentGame find no BLACK/WHITE player → `winner` = raw user id, `winner_color`
NULL, both names 'Unknown', both player ids NULL. Room game log has colour null too.
## Scope
1. One engine helper giving each player a record colour: assigned colour, else the provisional one
   (Renju: `tentativeBlackId` is Black; Swap2: first player is Black).
2. Use it in the three record builders (room saveGame + rating players, room game log, tournament save).
## Don't
- Change live `engine.players[].color` (opening UI depends on null until colours are assigned).
## Done when
- Mid-opening resign in Swap2 and Renju rooms → saved row has BLACK/WHITE names and winner colour; tests kept.
