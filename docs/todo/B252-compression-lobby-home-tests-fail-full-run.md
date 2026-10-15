# B252 — `compression` and `lobby-home` suites fail in the full `npm test` run
**Status:** OPEN
**Area:** server/tests/compression.test.js, client/tests/lobby-home.test.js
**From:** seen during #251 browser pass, 2026-10-15; same 2 fail on a clean `dev` worktree (97a4025)   **Depends:** —

## Problem
Full `npm test` ends `2 failed` every time (3 runs); each suite passes alone (`npx jest <file>`).
- compression: `compression is a real saving, not a formality` → `read ECONNRESET`.
- lobby-home: `quick-match waiting count (B210) › changing the chip re-reads the count for the new rule|time`
  expects `qm.in_queue{"n":3}`, gets `n:214` (stale/other count; both suites ~13-16 s = load-sensitive).

## Scope
1. Reproduce: full run vs `npx jest --runInBand` vs alone; find which neighbour/load flips them.
2. Root cause per suite (shared port/server in compression? async `flush()`/fetch-mock ordering or a leaked
   module-level count in lobby-home?), fix the test or the code it exposes.
3. Keep the tests; no timeout bumps as the only fix.

## Don't
- Don't skip/delete the tests; don't touch overlay code (#251) — unrelated.

## Traps
- Passes alone ⇒ order/load dependent; confirm with the full run, not the single file.

## Why this way
Recorded, not fixed (user rule: record new items mid-task). Knowledge: none.

## Done when
- `npm test` fully green on 3 consecutive runs; fix-log entry with root cause.
