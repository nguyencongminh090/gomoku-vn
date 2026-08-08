# Fix log entry — 2026-08-08 16:16

## Prompt

Follow-up from a code-review pass the user asked me to run on my own just-merged TODO.md #64 (Round
Robin Cross Table) work. The automated code-review skill I invoked mis-scoped itself onto commit
`5fbeb64` (#74, unrelated) instead of my own `20d23ff` — while re-diffing #64's own changes by hand to
compensate, I found a real bug in `buildPairingLookup()` and reported it. User confirmed: "you can fix
buildPairingLookup()".

## Action

`client/js/tournament-detail.js`'s `buildPairingLookup()` (added by #64) built a `Map` keyed by sorted
entry-id pair, with `lookup.set(key, p)` unconditionally overwriting on every pairing seen for that
key — i.e. "whichever pairing is visited last in `pairingsById` iteration order wins," with no
explicit tie-break.

Root cause: `PairingLifecycle._createReplayPairing()` creates a **brand-new pairing** (new
`pairingId`) between the same two entries for Round Robin/Swiss when a pairing goes to `void_replay`
(both players fail to check in before the deadline) — so more than one pairing object can legitimately
exist for the same entry pair. `TournamentManager.listPairings()` sorts "most recently paired first"
(descending `pairedAt`), and the client's initial load does
`pairingsById = new Map(data.pairings.map(p => [p.pairingId, p]))`, which inserts in that same
newest-first order — meaning the **older, voided pairing ends up visited LAST** in `Map` iteration and
silently won the overwrite race in the old code, shadowing the real, newer replay pairing. The Cross
Table would then show the voided pairing's placeholder/state instead of the replay's actual result.
Live `tournament:pairings_patch` updates make relying on iteration order worse, not better — a
newly-created replay pairing arriving via patch gets appended at the end of `Map` order regardless of
its `pairedAt`, so the ordering bug isn't just a one-time load-order fluke.

Fix: `buildPairingLookup()` now compares `pairedAt` explicitly — `if (!existing || p.pairedAt >
existing.pairedAt) lookup.set(key, p)` — so the newest pairing for a given entry pair always wins,
independent of iteration/insertion order.

Bumped `?v=85` → `?v=86` across every `client/*.html` and every `client/js/*.js` `?v=` import, verified
with `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` showing a single `?v=86` value.

## Decision

Branch `fix/cross-table-replay-pairing-lookup` off `dev` (not `main`) — `TODO.md #64`'s tracking entry
only exists on `dev`, same "fix whose tracking entry only exists on dev" exception in `CLAUDE.md` as
precedent (`#66`, `#73`).

Did the actual code-tracing (not speculation) before filing: read `_createReplayPairing`'s doc comment
confirming "Round robin/Swiss get a brand-new pairing," then `listPairings()`'s sort order, then the
client's `tournament:detail`/`tournament:pairings_patch` handlers' exact `Map` construction — all three
pieces needed to confirm the bug was real and reproducible, not just theoretically possible.

Ran the whole investigation + fix in an isolated `git worktree` (branched off `dev`), not the user's
main working directory — same precaution as #64 itself, after the earlier stash/worktree collision
this session hit while #74 was independently in flight on the user's side.

## Summary output

Verified the fix's logic in isolation with a small ad-hoc Node script (pure function, no DOM/server
dependency — `buildPairingLookup` only touches plain JS objects): simulated a voided pairing and its
replay, fed them through `buildPairingLookup()` in both iteration orders (replay-visited-first and
replay-visited-last), confirmed the replay pairing wins the lookup either way (old code only won in one
of the two orders, by accident of the array order matching the buggy assumption). Script deleted after
verifying (scratch tool, not part of the fix).

`npm test` — 931/931 pass (no regression; this is a client-side JS-only change, `client/` has no
automated test runner per CLAUDE.md, consistent with prior client-only fixes in this repo).

Committed on `fix/cross-table-replay-pairing-lookup` (off `dev`), to be merged back into `dev` with a
regular merge commit and the branch deleted afterward, per `CLAUDE.md`'s git workflow.
