# B175 — Rating engine (Glicko-2) + game→rating hook
**Status:** ✅ DONE 2026-10-09 — RatingService (Glicko-2, async queue) + handleGameEnd hook; server/tests/RatingService.test.js, rating-hook.test.js
**Area:** server/ (new RatingService), schema migration
**From:** features/platform, 2026-10-09   **Depends:** B174, planning Q3/Q4

## Problem
No ranking exists.

## Scope
1. Migration: ratings, rating_history, games.ranked. 2. RatingService per variant×speed. 3. Hook on game end. 4. Tests.

## Don't
- Start before Depends is done; details to be refined at pickup (re-read planning.md).

## Done when
- Backend tests; deltas emitted; casual/guest no-op.

## Decisions (user, 2026-10-09 — planning.md Q3/Q4)
- Glicko-2, start 1200 / RD 350 / vol 0.06, tau 0.5; 1 game = 1 rating period; provisional while RD > 110.
- Pool = winning rule (freestyle | standard | caro). Wall/portal/swap2 rate in their rule's pool. No speed split.
- Room `settings.ranked` toggle, default ON, snapshotted on the engine at game start. Tournament games unrated
  (they persist via saveTournamentGame, never reach handleGameEnd). Guests/casual = no-op.

## Result
- Schema: `ratings(user_id, category)`, `rating_history`, `games.ranked` (+ additive ALTER in database.js).
- `server/managers/RatingService.js`: pure `glicko2()` (matches Glickman's worked example), `isRatedGame`,
  `rateGame` (one tx), `createRatingQueue` (setImmediate batch, all-or-nothing — planning Q8 limit 1),
  `recordGame` hook. `handleGameEnd` rates only if saveGame succeeded; emits `rating:update`
  `{gameId, category, players:[{userId,before,after,delta,rd,provisional}]}` to the room.
- Not done here: client Ranked toggle + rating display → #182; Q8 limit 2 (`synchronous=NORMAL`) not applied;
  no RD growth for inactivity between games.
