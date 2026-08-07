# Tournament Live Matches Browser — Planning

Status: **scope locked (2026-08-07)**. Next step is formalizing into `TODO.md`/`instruction.md` per
`CLAUDE.md`'s feature workflow, on a `feature/tournament-live-matches-browser` branch off `dev`.

## Current-state findings (research, 2026-08-07)

Full trace of why the base "visitor can watch" requirement is already satisfied:

1. **Server has no enrollment gate on subscribing to a live match.**
   `TournamentMatchHandler.js`'s `tmatch:subscribe` handler (~line 384-404) only checks:
   ```js
   const match = tournamentState.tournamentGameMap.get(payload.pairingId);
   if (!match || match.tournamentId !== payload.tournamentId) { /* NO_ACTIVE_MATCH error */ }
   ```
   — no check against `tournament.entries` or the pairing's two participant `entryId`s. The doc
   comment directly above it already states the intent: "the only way for a SPECTATOR (anyone with
   the pairingId, not just the two players) to watch a tournament match, matching casual rooms
   allowing spectators via `room:join`." The enrollment-restricted path (`getOwnMatch()`, used by
   `tmatch:move`/`resign`/etc.) is a *different* function, not used by `subscribe`.
2. **Client already derives spectator status correctly.** `tournament-match.js`'s `myColor` is
   `null` whenever `userInfo.userId` isn't one of `gameState.players[]` — true for both visitor
   sub-cases (never-enrolled, and enrolled-but-not-in-this-pairing). The UI already hides
   move/resign/draw/time-request controls whenever `myColor === null`.
3. **Discovery already exists per-tournament.** `tournament.html` is reachable by any authenticated
   user (`authGuard()` only checks for a login token, no enrollment check), and its `tournament:get`
   handler likewise has no enrollment restriction. Each `InProgress` pairing card already renders a
   `btn_watch_match` ("Xem trận") button for non-participants (`isMine` computed from `myEntry()`,
   which is `null` for a non-enrolled visitor, correctly routing them to the watch button instead of
   the enter-my-match button).
4. **What's missing**: all of the above requires the visitor to already be on one specific
   tournament's detail page. There is no cross-tournament "what's live right now" view anywhere —
   confirmed with the user as the actual gap to fill.

## Data source design

- `tournamentState.tournamentGameMap` (keyed by `pairingId`) already holds one live-match context
  per in-progress pairing: `{engine, tournamentId, entryByUserId, userIdByEntry, ...}`
  (`tournamentState.js:36`). This is the exact source of truth for "what's live right now" — no new
  server-side tracking structure is needed, just a read-side query over an existing map.
- New read helper (exact home TBD at implementation time — likely `tournamentState.js` alongside the
  map it reads, or `TournamentManager.listLiveMatches()` if tournament metadata like tournament name
  needs joining in): iterate `tournamentGameMap`, and for each entry resolve:
  - `tournamentId` + tournament name (join against `tournamentManager.tournaments`).
  - Both player display names (via `entryByUserId`/`userIdByEntry` cross-referenced against
    `tournament.entries`).
  - Game/series progress if applicable (`seriesInfo` — gameIndex, seriesScore — reuse the same shape
    already sent in `tmatch:init`, per the tournament-match-series feature).
  - Spectator count — `_getSpectators(io, pairingId)` already computes this per-match
    (`TournamentMatchHandler.js:59-87`); reuse it rather than re-deriving room membership.
- **Real-time updates**: broadcast a lightweight "live matches changed" signal whenever a match
  starts (`TournamentMatchHandler.startMatch`) or ends (`_endMatch`, and the new cancel-tournament
  teardown path from the sibling feature, if that ships first) — target audience is "anyone with the
  live-matches browser open," which is a new, separate room/channel from any existing one (verify
  at implementation time whether an existing global lobby broadcast channel can be reused, per the
  `lobby:update` delta pattern from `docs/todo/B09-*.md`, or whether a dedicated room is cleaner).

## Open questions (non-blocking)

1. **Where does the browser live in the UI?** Candidates: a new panel/tab in the existing tournament
   lobby (`client/tournaments.html`), a section within `tournament.html`'s own page (less useful,
   since that page is already scoped to one tournament), or a fully separate page. **Leaning toward
   a panel in the tournament lobby** (`tournaments.html`), since that's already the natural landing
   page for "browsing tournaments," consistent with visitors arriving there before picking anything
   specific to look at.
2. **List size / cap.** The stress-test report showed the system already handles hundreds of
   concurrent games; a live-matches list could get long. Cap at some N (e.g. 20) with most-recently
   -started first, or most-spectated first? Needs a product call at implementation time, not a
   blocking design question.
3. **Filter/search.** Optional filter by tournament name, once the list is long enough to need it —
   deferred, not required for a first version.

None of these block writing the `TODO.md`/`instruction.md` entry.

## Sequencing

1. ~~Confirm actual scope with the user (spectating already works vs. needs new discovery UI).~~
   ✅ Done 2026-08-07 — scope is the live-matches browser.
2. ~~Formalize into `TODO.md`/`instruction.md`.~~ ✅ Done 2026-08-07 — code **B60**
   (`docs/todo/B60-*.md`, `docs/instruction/B60-*.md`).
3. Server: live-match aggregation read helper over `tournamentGameMap` + name/entry joins.
4. Server: broadcast wiring for match-start/match-end (and tournament-cancel, if that sibling
   feature has shipped) to a live-matches-changed channel.
5. Client: new panel in `tournaments.html`, subscribing to the channel above, rendering entries that
   link into the existing `goToMatch(pairingId)` navigation (`tournament-detail.js:292-294`) — no
   changes needed to `tournament-match.js`'s subscribe/spectate flow itself.
6. Unit tests (`server/tests/`) for the aggregation helper — cover: zero live matches, one, several
   across different tournaments, a match ending mid-list (removed from subsequent queries), spectator
   count reflecting `_getSpectators` correctly.

## Related files

- [user_story.md](user_story.md) — actors, stories, resolved scope.
- [diagram/uml_diagram/sequence-browse-live-matches.md](diagram/uml_diagram/sequence-browse-live-matches.md)
- [../tournament/planning.md](../tournament/planning.md) — base tournament feature (already
  implemented, B48) that this extends.
