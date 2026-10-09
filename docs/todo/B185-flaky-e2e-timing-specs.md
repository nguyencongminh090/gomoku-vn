# B185 — flaky e2e specs (timing-sensitive assertions)
**Status:** ✅ FIXED 2026-10-09 — all 3 were spec races, fixed in the specs; app bug -> #186, other flakes -> #187/#188 ([fix-log](../fix-log/2026-10-09-todo-185-flaky-e2e-spec-races.md))
**Area:** e2e/lobby-patch-incremental-render.spec.ts, game-optimistic-render.spec.ts, move-validation.spec.ts
**From:** #183 re-runs, 2026-10-09   **Depends:** B183 ✅

## Problem
With auth/env/quota fixed (#183) these pass or fail run-to-run on the same code, localhost server, 1 worker:
- `lobby-patch-incremental-render` — fails in ~2 of 3 runs: `only the changed room's row should be touched`
  (an extra room row gets a DOM mutation inside the observation window; suspect row entry-animation attr/class
  changes landing after the observer attaches, or a seeder room still settling).
- `game-optimistic-render` "a real click draws the mover's own stone immediately": `stoneRightAfterClick` is
  `null` sometimes — on ~0 ms localhost RTT the ack can beat the check (the 500 ms-RTT sibling is the real test).
- `move-validation` "occupied cell must be rejected": `error` undefined once (ack shape / ordering vs the emit).
None reproduces deterministically; none is auth-related.

## Scope
1. For each: capture a failing trace (`--trace on`), decide app race vs spec race.
2. Spec race -> wait on a state change instead of a timeout/instant read; app race -> its own fix item.
3. Rerun 5x in a row before closing.

## Don't
- Don't add blanket `retries` to hide them.
- Don't raise MAX_ROOMS_PER_IP.

## Done when
- 5 consecutive full runs green (see e2e/README.md recipe), or each remaining flake has its own item.
