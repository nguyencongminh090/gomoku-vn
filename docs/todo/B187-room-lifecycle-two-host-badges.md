# B187 — room-lifecycle: two host badges after host leaves (1 in 5 full runs)
**Status:** OPEN
**Area:** e2e/room-lifecycle.spec.ts:96, client users-list render (room-socket room:updated delta), RoomManager host transfer
**From:** #185 5x full-suite verification, 2026-10-09 (run 5)   **Depends:** —

## Problem
"host leaving promotes the remaining member to host": after `RoomState.roomData.hostId === B`,
`#users-list .slot-card__role--host` resolved to 2 elements (both "CP"). Either the departed host's
row is still rendered with a host badge, or B's row is duplicated. Passed 4/5 full runs.

## Scope
1. Reproduce (loop the single spec, fresh server each run — see #186); dump `#users-list` rows + the
   last `room:updated` payloads when 2 badges show.
2. App race (stale/duplicate row in the users-list delta) -> fix + jsdom test; spec race -> wait on state.

## Don't
- Don't switch the locator to `.first()` to make it pass.

## Done when
- Root cause in the fix-log; spec green 10x in a row.
