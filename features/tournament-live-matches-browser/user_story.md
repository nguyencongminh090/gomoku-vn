# Tournament Live Matches Browser — User Story

Extends [features/tournament/user_story.md](../tournament/user_story.md) (base tournament feature,
already implemented — see `TODO.md`/`instruction.md` B48).

## Origin

User request, 2026-08-07: "Visitor is able to view tournament game. (Visitor = who does not enroll &
enrolled but not play in pairs — summary, visitor = player not in a pair)."

**Research finding (2026-08-07): this already works end-to-end today, with zero code changes.** See
[planning.md](planning.md#current-state-findings-research-2026-08-07) for the full trace. In short:
- `TournamentMatchHandler.js`'s `tmatch:subscribe` handler has **no enrollment check at all** — the
  only gate is "does a live match exist for this `pairingId`." Any authenticated socket (guest or
  not, enrolled or not) can subscribe.
- `tournament.html`'s pairing list already renders a "Xem trận" (watch match) button for any
  non-participant on any `InProgress` pairing, and clicking it lands on exactly this flow.
- The client already renders spectators with no action buttons (`myColor === null` case), and
  already has a live "Khán giả" (spectator) tab showing who else is watching.

So this document's actual scope — confirmed with the user, 2026-08-07 — is **not** "build
spectating," it's a genuinely new addition on top of already-working spectating: **a dedicated
live-matches browser**, so a visitor doesn't have to already be looking at one specific tournament's
pairing list to find something to watch.

## Actors

- **Visitor** (new actor for this document) — any authenticated user (guest or registered) who is
  either (a) not enrolled in a given tournament at all, or (b) enrolled but not currently one of the
  two players in a live pairing. Both sub-cases are already handled identically by the existing
  `tmatch:subscribe` flow — a Visitor is simply "not one of this match's two players."
- **Player**, **Organizer** — same as base feature, unchanged by this document.

## User stories

- As a **visitor**, I want to see a list of every tournament match that is currently live, across
  all tournaments, from one place — not just the pairing list of one tournament I happen to already
  be viewing — so I can find something to watch without hunting.
- As a **visitor** browsing the live-matches list, I want enough context per entry (tournament name,
  both player names, how far into the game/series they are) to decide whether to click in.
- As a **visitor** watching the live-matches list, I want it to update in real time as matches start
  and end, so I don't click into a match that just finished.
- As a **visitor**, clicking an entry takes me straight into the existing spectator flow
  (`tournament-match.html`) — this document does not change anything about the actual in-match
  viewing experience, only how a visitor discovers a match to click into.

## Resolved decisions (2026-08-07)

1. **Scope is additive UI/discovery only** — the existing `tmatch:subscribe` no-enrollment-check and
   in-match spectator rendering are correct as-is and are not touched by this feature.
2. **Live-matches list is global**, spanning all tournaments, not scoped to one tournament's pairing
   list (which already exists and is unaffected).
3. **Real-time**, not a static snapshot — the list reflects matches starting/ending live, consistent
   with how `tmatch:presence` already keeps the in-match spectator list live.

## Related files

- [planning.md](planning.md) — current-state findings, data-source design, implementation
  sequencing.
- [diagram/uml_diagram/sequence-browse-live-matches.md](diagram/uml_diagram/sequence-browse-live-matches.md)
  — sequence for opening the browser, seeing an update, and clicking into a match.
- [../tournament/user_story.md](../tournament/user_story.md) — base tournament feature; defines
  Player/Organizer actors.
- [../tournament-cancel/user_story.md](../tournament-cancel/user_story.md) — sibling feature
  discussed in the same request; unrelated mechanism, no shared code path.
