# Fix log entry — 2026-08-02 03:49

## Prompt

Backend TODO Phần B #12 (verification report on `3da53dd`): in `cancelDisconnectGrace` ([DisconnectHandler.js](server/socket/handlers/DisconnectHandler.js)) the grace timer was torn down — `clearTimeout` + `clearInterval` + `disconnectTimers.delete()` — **before** the two guard checks below it (`!room

## Action



## Decision

!room.gameState`, and `!room.users.has(userId)`). Either early return therefore left the game with nothing to finish it: the timeout that would have called `handleGameEnd` was already cleared and its entry gone, so the room sat in `'interrupted'` permanently — a state `_idleCleanup` deliberately skips, so nothing else would ever collect it either. `instruction.md` §B12 confirms this is a **latent** bug, not an open one (fix #6 already blocks kicking while `interrupted`, which was the only known way to reach the membership branch), and scopes the fix to reordering two existing blocks — not rewriting the logic. | Moved the three teardown lines below both guards, so bailing out now leaves the grace period running exactly as if the player had never reconnected. No other change. | The reorder has a second constraint the item did not mention, and getting it wrong would break the ordinary case rather than a latent one: the teardown must stay **above** the `otherStillAway` scan a few lines further down. That scan asks whether anyone *else* from the room is still in grace, and with this player's own entry still in the map it would always match them, so no game would ever resume. Both boundaries are now written into the comment at the site, and both are pinned by tests (see Evidence) rather than left as prose.

## Summary output

`npm test`: 264/264 passing, 14 suites green (was 261). Added 3 tests to [server/tests/DisconnectHandler.test.js](server/tests/DisconnectHandler.test.js): losing room membership mid-grace returns false, leaves the entry armed, and the grace timeout still fires so `handleGameEnd` runs and the room is not stranded; a vanished room likewise leaves the entry alone; and a normal reconnect still tears the timer down exactly once, resumes, and the cleared timeout does not later fire against a resumed game. **Mutation-checked in both directions:** restoring the original order fails the 2 new bail-out tests; moving the teardown too far down (below the `otherStillAway` scan) fails 4 tests including 3 pre-existing resume tests. Restored from backup after each, `git diff` verified clean. No browser verification: the fix is a reordering on a path that, per the reviewer, is not reachable from the UI today — the tests construct the state directly, which is the only way to exercise it at all.
