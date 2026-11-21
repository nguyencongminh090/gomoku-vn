# F427 — Renju P2: Taraguchi-10 + Yamaguchi opening step machine
**Status:** BUILT, uncommitted on feature/427-renju-openings (2026-11-21); awaiting review/commit
**Area:** server/managers/GameEngine.js + RenjuOpening.js (new), GameHandler, TournamentMatchHandler, RoomManager/ChallengeService/TournamentManager settings, client game-ui/board/room-ui/lobby/challenge-modal/tournaments/tournament-match, i18n
**From:** user "Continue P2" 2026-11-21 (after #425 P1); design features/renju/   **Depends:** #425

## Problem
Renju has only FreeRenju. Add the two RIF openings (renju.net/rule/25, /rule/5).
## Scope
1. Setting `openingRule`: null | 'taraguchi10' | 'yamaguchi'. Only with winningRule 'renju' + 15x15; forces walls/portals off and Swap2 off; else dropped to null.
2. Taraguchi-10: B1 centre, swap, W2 3x3, swap, B3 5x5, swap, W4 7x7; then Black holder picks: stay / swap (choice 1: B5 in 9x9, swap, play) or offer (choice 2: 10 non-symmetric 5ths anywhere, White picks one, plays 6).
3. Yamaguchi: first player places B1 centre, W2 3x3, B3 5x5, declares N (1..10, user 2026-11-21); other player may swap; W4 anywhere; Black offers N non-symmetric 5ths; White picks, plays 6.
4. Swap = colours exchange; the player who would move next decides. Colours stay unassigned (like Swap2) until the opening ends; play always starts with White to move.
5. "Symmetric" = mapped onto an existing offer by a board symmetry (8 dihedral about centre) that fixes stones 1-4.
6. Surfaces: rooms, challenges, tournaments (user 2026-11-21 "Tất cả bề mặt"); create pickers + in-room/tmatch opening UI; undo/reconnect.
## Don't
- Don't change Swap2 behaviour or its socket events' meaning (reuse `*:swap2_place` / `*:swap2_choice` / `*:swap2_state` transport).
- No bots for these (bots already refuse renju).
## Traps
Timer placeholder slots = first/second player until remap; undo snapshots must carry step index, tentative black, offers, N; offers live off the board (not in moveHistory) until picked.
## Done when
- Engine + handler tests, jsdom for opening UI, real-browser pass of one Taraguchi and one Yamaguchi game.

## Built
Engine: server/managers/RenjuOpening.js (step programs, offers off-board, symmetry via renju-openings.js fixingSymmetries), GameEngine hasOpening()/openingRule/undo snapshot. Settings: rules.js applyOpeningRule (room, challenge, tournament). Handlers: GameHandler finishOpening/emitOpeningName + clock follows swaps; tmatch same. Client: renju-opening-ui.js (shared hint/buttons/zone), board.js offers overlay, game-ui, tournament-match, pickers (lobby, room settings, challenge, tournament), i18n vi/en, OPENING_NOT_CENTRE/OUT_OF_ZONE/OFFER_SYMMETRIC/NOT_AN_OFFER.
Verified: npm test 4567 green; real-browser pass (Chromium, :3101, temp DB) of one Taraguchi-10 (swap, offer-10, pick) and one Yamaguchi (declare 3, swap, offers, pick) game from the lobby modal to move 6. Phone 390x844 pass of both: fits. Also fixed B428 (tmatch colours after opening, fix-log 2026-11-21). Not verified in a browser: tournament match page, challenge modal, undo mid-opening. per_move clock: user 2026-11-21 chose refresh per step → done (fix-log 2026-11-21 opening-clock-per-step). Game ending mid-opening stores winner as a raw user id (colours null) — same as Swap2, caught, not fixed.
