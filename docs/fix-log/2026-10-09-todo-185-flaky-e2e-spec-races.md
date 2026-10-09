# 2026-10-09 15:21 — #185 flaky e2e: lobby-patch, game-optimistic-render, move-validation
## Prompt
"do #185"
## Root cause
All three were spec races. One app bug turned up and was filed separately.
- move-validation: `emitMove` resolved on the room-wide `game:moved` broadcast. The opponent's copy of the
  previous move could arrive after the next call attached its listener, so it got `{moved}` with no `error`.
- game-optimistic-render (both the 0 ms and "~500ms RTT" tests): read `optimisticStone` after `click()` returned.
  The localhost ack had sometimes already cleared it (CDP latency doesn't reach the open WS, see spec note).
- lobby-patch: the last seeder's room:create lobby:patch (300 ms debounce, `state.js`) arrived after the
  observer's snapshot, so that row was re-applied while being watched. That overlap is documented server behaviour.
  Failed 4/4 on a fresh server; the WS frame capture showed the `#<seeder3>` upsert 70 ms after attach.
- App bug found: a room of only disconnected viewers is never destroyed (#186). That caused every later
  `waitForEmptyLobby` to time out on reruns against one server.
## Fix
Spec-only, no app code changed. `emitMove` waits for its own `emitAck` reply and waits for both moveCounts after
legit moves. `recordOptimisticSets()` records each set in the page with `at` + `moveCount` (must be 0).
The lobby observer waits until no `lobby:` frame has arrived for 1 s before attaching. No retries added, no
quota change. `e2e/README.md`: known state + restart the server between runs (#186). Branch `fix/185-flaky-e2e` off dev.
## Verification
Before: 3 specs x5 on one server -> optimistic-RTT 3/5 fail, lobby 5/5 fail (1 race + 4 #186 timeouts).
After: 3 specs x5 (fresh server each) 30/30 green; full suite x5: 56, 54, 56, 56, 55 of 56. The failures
were tests/example.spec.ts hitting playwright.dev (#188) and room-lifecycle two host badges (#187), not these specs.
Real DB restored, checksum OK. Not verified: firefox/webkit.
