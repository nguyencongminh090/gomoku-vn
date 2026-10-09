# B174 — Storage/scale decision for thousands of users
**Status:** ✅ DONE 2026-10-09 — decision: keep SQLite (WAL) + async rating-write queue + synchronous=NORMAL; numbers in features/platform/planning.md Q8
**Area:** server/db, docs/knowledge
**From:** features/platform, 2026-10-09   **Depends:** B172 (can run parallel)

## Problem
SQLite suitability for rating history, leaderboards, feeds at public scale.

## Scope
1. Measure write/read load model. 2. Apply data-storage-selection. 3. Decide keep-SQLite+limits vs migrate.

## Don't
- Start before Depends is done; details to be refined at pickup (re-read planning.md).

## Done when
- Written decision in planning.md Q8 with numbers.
