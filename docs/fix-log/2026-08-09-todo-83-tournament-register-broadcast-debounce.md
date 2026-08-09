# Fix log entry — 2026-08-09 10:11

## Prompt

Do #83 (TODO.md #83 / instruction.md B83): debounce `tournament:register`/
`tournament:unregister`'s `broadcastTournamentDetail` broadcast the same way
`_queuePairingChanged` already debounces pairing changes, so a burst of
near-simultaneous register/unregister calls collapses into one broadcast
instead of one per operation.

## Action

Added `_queueTournamentDetailUpdate(io, tournament)` to
`server/socket/handlers/TournamentHandler.js`: a `Map<tournamentId,
tournament>` pending queue plus a `Map<tournamentId, Immediate>`, flushed via
`setImmediate` — same shape as the existing `_queuePairingChanged`/
`_pairingPatchQueues` pattern. `tournament:register` and
`tournament:unregister` now call this instead of calling
`broadcastTournamentDetail` directly. Per `instruction.md`'s explicit
boundary, `tournament_started`/`tournament_completed`/`tournament_cancelled`
(wired in `init()`) were left calling `broadcastTournamentDetail` directly —
those are rare, singular events, not caused by concurrent user actions.

`broadcastTournamentListUpdate` (the lobby-wide broadcast) was already
debounced via a 300ms `setTimeout` keyed globally on `io` — no change needed
there, confirmed by reading the code before touching anything (per
instruction.md's explicit "check first" note).

## Decision

Scope kept to exactly what instruction.md described: no change to
`_diffTournamentEntries`'s per-entry `JSON.stringify` diff algorithm (out of
scope per instruction.md), and no change to the `tournament:get` round-trip
(that was #82, already fixed separately).

## Summary output

- `server/socket/handlers/TournamentHandler.js`: new
  `_queueTournamentDetailUpdate` debounce helper; `tournament:register`/
  `tournament:unregister` route through it.
- `server/tests/TournamentHandler.test.js`: 3 new test cases — single
  register still flushes on the very next tick (no perceptible delay), a
  burst of 2 registers for the same tournament collapses into 1 broadcast, a
  register immediately followed by an unregister for the same tournament
  also collapses into 1 broadcast.
- `npm test`: 39 suites / 951 tests passing.
- Branch: `fix/tournament-register-broadcast-debounce`, off `dev` (TODO.md
  #83's tracking entry exists only on `dev`, not `main`, per the git
  workflow's dev-only-tracking-entry exception).
