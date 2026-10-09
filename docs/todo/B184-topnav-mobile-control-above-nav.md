# B184 — mobile room topnav: a control starts 2.5px above the nav box
**Status:** OPEN
**Area:** client/css (room topnav / app shell), e2e/topnav-minimal-mobile.spec.ts
**From:** #183 e2e re-run, 2026-10-09   **Depends:** —

## Problem
`e2e/topnav-minimal-mobile.spec.ts` (TODO #144) fails on both Pixel 5 and iPhone SE 375x667:
`control must not start above the nav` — expected box.y >= nav.y - 1, got -2.5 (leave/room-code/settings
loop, first offender not recorded). Passed-by-design in #144; the likely cause is the #173 Arena app shell
(`137530f`) touching the topnav, but that is unverified — it was never run between #173 and now.

## Scope
1. Reproduce at 393x851 and 375x667 (real browser, zen/mobile), find which control and by how much.
2. Decide: real clipping/overflow bug -> fix CSS (+ ?v bump); or the assertion's 1px tolerance is stale -> adjust spec.
3. Re-enable the two `test.fixme` cases in the spec.

## Don't
- Don't loosen the tolerance until you've looked at a screenshot (rule: UI bugs need visual evidence).

## Done when
- Spec un-fixme'd and green, or the tolerance change is justified in the fix-log.
