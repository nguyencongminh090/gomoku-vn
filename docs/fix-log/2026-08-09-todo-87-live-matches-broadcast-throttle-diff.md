# Fix log entry — 2026-08-09 12:11

## Prompt

Do #87 (TODO.md #87 / instruction.md B87): `broadcastLiveMatchesUpdate` (Live
Matches Browser, #60) is the one tournament broadcast with no debounce/diff —
huỷ 1 giải đấu có N ván đang live bắn N lần tính toán + N emit toàn phòng
liên tiếp (qua vòng lặp `forceCancelMatch` mỗi pairing) thay vì gộp 1 lần.

## Action

`server/socket/handlers/TournamentMatchHandler.js` — rewrote
`broadcastLiveMatchesUpdate(io)` to coalesce + diff, mirroring
`TournamentHandler.js`'s existing `_queuePairingChanged` pattern (see #83):

- Two module-level vars, `_liveMatchesUpdateTimer` (pending `Immediate`
  handle) and `_lastLiveMatchesBroadcast` (JSON string of the last list
  actually sent). Only one `io` per process, so no `Map`/`WeakMap` keyed by
  tournamentId/io is needed here — a single global list, unlike
  `_pairingPatchQueues`'s per-tournamentId queues.
- A call while a flush is already pending just returns (`if
  (_liveMatchesUpdateTimer) return;`) — several synchronous calls in the same
  tick (the `forceCancelMatch` cascade) collapse into the one already
  scheduled.
- The flush itself computes `listLiveMatches(io)`, and skips the emit
  entirely if the serialized result is identical to the last broadcast — a
  redundant flush (e.g. a match starting and ending within the same
  coalesced window, netting no actual change) sends nothing.
- Exported `broadcastLiveMatchesUpdate` (previously private) alongside the
  already-exported `listLiveMatches`, so it's directly unit-testable rather
  than only indirectly through `startMatch`/`forceCancelMatch`.

Kept unchanged per instruction.md's explicit boundaries: `startMatch()` and
match-end still call `broadcastLiveMatchesUpdate` directly at their existing
call sites (each is one real lifecycle event, not a burst — coalescing a
single call is a no-op delay of one tick, not a behavior change worth
special-casing); the `live_matches:list` wire shape (`{ matches: [...] }`)
is unchanged, so no client (`client/js/tournaments.js`) changes were needed;
`listLiveMatches()`'s O(total live matches) cost before the
`MAX_LIVE_MATCHES` slice was left untouched (instruction.md flags this as a
separate, unmeasured optimization, not part of #87's scope).

## Decision

Scope kept to exactly what instruction.md described: coalesce + skip-if-
unchanged only. Did not touch `listLiveMatches()`'s algorithmic complexity,
did not change the `MAX_LIVE_MATCHES` cap, and did not switch the broadcast
to an upsert/removed patch shape (the client already fully re-renders the
list on every `live_matches:list` event and the list is capped at 20 rows,
so a patch protocol would need client changes for no real benefit here —
noted as an explicit non-goal in instruction.md).

## Summary output

- `server/socket/handlers/TournamentMatchHandler.js`: `broadcastLiveMatchesUpdate`
  now coalesces via `setImmediate` + skips unchanged flushes; exported for
  direct testing.
- `server/tests/TournamentMatchHandler.test.js`: 4 new test cases (describe
  `broadcastLiveMatchesUpdate throttle + diff (TODO.md #87)`) — a single
  lifecycle event still flushes on the very next tick; a `forceCancelMatch`
  loop over 3 live pairings of one tournament (mirroring
  `TournamentHandler.js`'s real `tournament_cancelled` shape exactly)
  collapses into 1 broadcast instead of 3; an unchanged flush is skipped; a
  genuinely changed flush is still sent. Needed a local `beforeEach` to drain
  any timer left pending by earlier, unrelated tests in the same file (fake
  timers aren't auto-reset between tests) before each case in this block.
- `npm test`: 40 suites / 970 tests passing (up from 966; 4 new tests, no
  regressions).
- Branch: `fix/live-matches-broadcast-throttle`, off `dev` (both the buggy
  file and TODO.md #87's tracking entry exist only on `dev` — `main` doesn't
  have `TournamentMatchHandler.js` at all yet, per the git workflow's
  dev-only exception).
