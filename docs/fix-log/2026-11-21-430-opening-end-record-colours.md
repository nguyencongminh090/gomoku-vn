# 2026-11-21 12:12 — #430 game ending mid-opening saved winner as a raw user id
## Prompt
User 2026-11-21: "Sửa cho cả Swap2 + Renju" (open #427 question 2).
## Root cause
Swap2 and Renju openings keep `players[].color` null until the opening ends. The three record builders (room saveGame + rating players, room game log, tournament saveTournamentGame) copied `p.color`, so a resign/timeout/disconnect mid-opening found no BLACK/WHITE player: winner = raw user id, winner_color NULL, names 'Unknown', player ids NULL.
## Fix
- server/managers/GameEngine.js: recordColor(userId) — assigned colour, else provisional (Renju tentativeBlackId, Swap2 firstPlayerId = Black). Live colours untouched.
- GameHandler handleGameEnd players + appendGameLog, TournamentMatchHandler _endMatch: use recordColor.
## Verification
- GameEngine.test.js (3): no opening / Swap2 / Renju tentative holder.
- GameHandler-renju-opening.test.js (2): Renju after swap → p2 BLACK in saveGame + game log; Swap2 place3 → p1 BLACK.
- TournamentMatchHandler.test.js (1, real :memory: DB): Taraguchi swap then resign → black/white names right, winner 'BLACK'.
- 3 of these fail with recordColor returning the live colour.
