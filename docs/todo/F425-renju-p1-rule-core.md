# F425 — Renju P1: rule core + enum/DB + free/Pro opening
**Status:** BUILT, uncommitted on feature/425-renju (2026-11-21); awaiting review + commit
**Area:** client/js/renju.js (new, shared), server/managers/GameEngine.js, RoomManager, ChallengeService, TournamentManager, PuzzleService/Verifier, server/engine/RuleMapper+constants, server/db (migration), RatingService, i18n
**From:** user "Implement Renju Rule (support all variants)", 2026-11-20; design in features/renju/   **Depends:** —

## Problem
No Renju. Scope (2026-11-20): FreeRenju (P1), Taraguchi-10 + Yamaguchi (P2, own code), UI + browser pass (P3). Long Pro = Pro, not needed with Renju+WALL.
## Scope
1. Pure `renju.js`: forbidden detector (five wins; recursive 3-3 exception; 4-4 incl. same line; overline). Fixture tests.
2. `winningRule: 'renju'`: Black exactly 5, White 5+; forbidden move = **Black loses immediately**. 15x15; walls allowed (Renju+WALL skips Long Pro wall opening rules for now); no portals/torus. Variants P1: FreeRenju only.
3. One rule enum source; migration for CHECK enums (schema.sql, 012/013, ratings.category) on live DB v14; rating pool 'renju'; i18n `rule.renju`, `rankings.cat_renju`.
4. Surfaces: custom rooms + challenges, tournaments, puzzles + bots (bots only if Rapfi build has RULE 2/4 — verify; else refuse). NOT quick-match.
5. Client: rule picker entries, forbidden-point ✕ for Black, loss message.
## Don't
- Don't touch Swap2/opening code (P2). Don't flip an "is rejected" test until its surface is enabled: engine-rulemapper:16, MatchQueue:113 (stays), lobby-home:388 (stays), db-constraints:132 (flip).
- Don't invent Long Pro or opening coordinates.
## Traps
Five beats forbid; 3-3 recursion; replay/undo/reconnect must recompute forbid; stash other sessions' dirty files — branch `feature/425-renju` off dev, stage own files only. Rules: docs/knowledge/renju-rif-rules.md.
## Why this way
Shared pure module = one source for server legality, client markers, puzzle verifier (rule 9).
## Done when
- Backend tests + jsdom + real-browser pass; migration applied to a copy of the live DB.

## Built (P1)
renju.js (forbidden detector), renju-openings.js (26 names, 8 symmetries, else free-open), GameEngine (Black exactly 5 / White 5+, forbidden = Black loses, Renju+WALL skips wall opening rules), server/managers/rules.js (one enum), migration 018 (ratings CHECK), rooms/challenges/tournaments/puzzles/ratings accept 'renju' (portals forced off), PuzzleVerifier `forbidden` break, client: pickers, i18n vi+en, no-entry sign on forbidden cells (room + tournament match), system-chat lines (forbidden loss, opening name). 4516 tests green; real-server browser pass (room only, own DB, port 3102): sign shown on Black's turn, loss + free-open + Chosei chat lines verified.
## Not done / open
- Bots: engine still refuses 'renju' (ENGINE_RULE_UNSUPPORTED; test engine-rulemapper:16 kept). Rapfi RULE 2/4 semantics unverified.
- Quick-match excluded on purpose (MatchQueue test kept). Opening-name line only in rooms (no chat in tournament match). Tournament match page: no browser pass.
- Rankings/club/profile now have a 4th category chip: phone layout not looked at.
- P2: Taraguchi-10 + Yamaguchi step machine; Long Pro = Pro, not needed with Renju+WALL.
