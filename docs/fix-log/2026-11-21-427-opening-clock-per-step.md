# 2026-11-21 12:10 — #427 per_move clock refreshes on every Renju opening step
## Prompt
User 2026-11-21 answer to the open #427 question: "Làm mới mỗi bước" (per_move: refresh the clock per offer / per stone).
## Root cause
The opening handlers only touched the clock when the turn passed to the other player (switchTurn → applyMove resets the mover in per_move). Steps by the same actor in a row (Taraguchi's 10 offers, Yamaguchi's 3 stones + declare) shared one per_move window (~6 s per offer at 60 s).
## Fix
- server/managers/TimerManager.js: refreshPerMove(color) — per_move only, resets that colour, keeps activeColor; other modes no-op.
- server/socket/handlers/GameHandler.js: refreshOpeningClock() after each successful swap2_place / swap2_choice when engine.openingRule is set (before switchTurn / remap); timer:sync emitted when the actor keeps the turn.
- server/socket/handlers/TournamentMatchHandler.js: same, entry-based slots; tmatch:timer_sync emitted.
- Swap2 unchanged (its 3/2-stone placements stay one window). blitz gets no per-step increment.
## Verification
- TimerManager.test.js (3): per_move reset only named colour; per_game/blitz no-op.
- GameHandler-renju-opening.test.js (3, real TimerManager): Yamaguchi 3 stones + declare each refresh; 9 Taraguchi offers each refresh; per_game unchanged. 2 fail without the fix.
- TournamentMatchHandler.test.js (1): 3 Yamaguchi stones → 3 refreshes + 3 tmatch:timer_sync.
