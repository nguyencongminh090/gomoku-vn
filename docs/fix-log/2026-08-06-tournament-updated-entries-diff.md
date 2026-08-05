# Fix log entry — 2026-08-06 03:17

## Prompt

Code review of the earlier `pairing_changed` batching fix flagged a separate, still-open issue: "Medium
performance: `TournamentHandler.js` (line 94) still broadcasts a full `tournament:updated` payload
after each registration/unregistration (lines 237 and 256). That payload includes every tournament
entry via `TournamentManager.js` (line 880)." `broadcastTournamentDetail()` called
`tournamentManager.serializeTournamentUpdate(tournament)`, which — despite its "diffed broadcast shape"
doc comment — still returned the FULL `entries` array (every registered player) on every call. A
tournament with N registered players re-sent all N entries to the whole tournament room on every single
register/unregister, the same shape of problem `_diffRoomUsers`/`_diffLobbyRooms` were already built to
fix elsewhere in the codebase.

## Action

Added an `entries`-only diff in [TournamentHandler.js](server/socket/handlers/TournamentHandler.js),
mirroring `state.js`'s `_diffRoomUsers` exactly (same upserts/removed shape, same "only included when
something actually changed" rule):

- `_tournamentEntrySnapshots: Map<tournamentId, Map<entryId, serialized-entry JSON>>` — module-level,
  keyed per tournament (mirrors `_diffRoomUsers` being keyed per `roomId`, not per-`io`/per-socket,
  since all viewers of one tournament room share the same broadcast).
- `_diffTournamentEntries(tournamentId, entries)` — same JSON-string-compare-and-diff logic as
  `_diffRoomUsers`.
- `broadcastTournamentDetail(io, tournament)` now calls `serializeTournamentUpdate()`, diffs
  `full.entries || []` (the `|| []` guards call sites/tests whose mock doesn't return an `entries` field
  at all), strips the full `entries` key from the payload, and re-adds it as `{ upserts, removed }` only
  when non-empty. Scalar fields (`status`, `currentRoundIndex`, etc.) are always included, same as before
  — only `entries` is diffed, matching how `_emitRoomUpdate` only diffs `users`/`scoreTable` and leaves
  scalars alone.
- `TournamentManager.serializeTournamentUpdate()`'s doc comment updated to clarify it still returns the
  full array — the diff happens one layer up in `TournamentHandler.js`, not inside `TournamentManager`.
- Client (`tournament-detail.js`)'s `tournament:updated` handler updated to apply an `entries` patch
  (upsert/remove into the existing `entriesById` Map, mirroring `tournament:pairings_patch`'s pattern)
  instead of assuming `data.entries` is always the full array; when `entries` is absent (nothing
  changed) it's simply skipped via object destructuring, leaving `tournament.entries` untouched.

## Decision

Diffed `entries` specifically (not the whole `tournament:updated` payload) because the other fields
(`status`, `currentRoundIndex`, `totalRounds`, `organizerName`, ...) are cheap scalars regardless of
tournament size — same reasoning `_emitRoomUpdate`'s doc comment gives for why only `users`/`scoreTable`
(the array-shaped, size-scaling fields) get diffed there, and scalars don't.

Did not add a debounce here (unlike the `room:updated`/`pairing_changed` fixes) — register/unregister
are already one-at-a-time user actions with no documented burst scenario analogous to TODO #22's
audience-join stress test; diffing alone removes the actual reported cost (re-sending every existing
entry) without adding latency where there's no evidence a burst exists.

Used distinct tournamentId strings per test case in the new
`TournamentHandler.test.js` describe block (`te-first`, `te-added`, `te-removed`, ...) rather than
reusing `t1` like the rest of the file, since `_tournamentEntrySnapshots` is module-level state that
Jest's `jest.clearAllMocks()` (used in this file's `beforeEach`) does not reset — reusing an id already
exercised by an earlier test would silently carry over its diff baseline.

## Summary output

`npm test`: 731/731 passing (was 724 before this fix — 7 new cases added to
`TournamentHandler.test.js` covering first-broadcast-upserts-all, no-change-omits-entries,
added-entry-only-in-upserts, removed-entry-only-in-removed, per-tournament independence, scalars-always-
included-alongside-a-diff, and the no-entries-field-at-all guard). Bumped cache-bust `?v=60 → ?v=61`
(the client-side `tournament-detail.js` change).
