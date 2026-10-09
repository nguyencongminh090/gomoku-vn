# B175 — Rating engine (Glicko-2) + game→rating hook
**Status:** OPEN (blocked)
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
