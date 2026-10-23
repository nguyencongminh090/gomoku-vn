# B333 — Show a puzzle index (#n) in its name
**Status:** OPEN
**Area:** server/managers/PuzzleService.js, server/routes/puzzles.js, client puzzle list/page, db puzzles table
**From:** user, 2026-10-23 (puzzle mechanics review)   **Depends:** —

## Problem
Puzzles are identified by UUID; users cannot refer to one by number. Wanted: a stable sequential number shown as '#n' next to the title (assumed meaning of 'indexing puzzle in name (#n)' — confirm).

## Scope
1. Add a monotonic per-puzzle number assigned at creation (migration + backfill by created_at).
2. Expose in shape(); render '#n Title' in list, page, review queue, profile.
3. Allow lookup by number.

## Don't
- Do not reuse numbers of deleted/rejected puzzles. Do not change the UUID id.

## Done when
- Every puzzle view shows #n; numbers unique and stable; migration test.
