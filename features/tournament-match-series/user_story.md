# Tournament Match Series — User Story

Extends [features/tournament/user_story.md](../tournament/user_story.md) (base tournament feature,
already implemented — see `TODO.md`/`instruction.md` B48). That feature models one pairing =
exactly one game. This document covers making a pairing a **multi-game series** instead.

## Origin

User report, 2026-08-06: "Currently, 1 pair play only 1 game. I would like to set games per round:
such as 1 pair should play 10 games or reach minimum 12 scores +- 2 diff."

## Actors

Same as base tournament feature: **Player**, **Organizer** (see
[../tournament/user_story.md](../tournament/user_story.md) for full actor definitions — this
document does not redefine them).

## User stories

- As an **organizer**, I want to configure, per tournament, how a pairing's overall winner is
  decided — either a fixed number of games, or a "first to reach a target score with a lead" rule
  — so that pairings can be a short multi-game series instead of a single decisive game.
- As a **player**, I want to see my running score within the current pairing's series (e.g. "2.5 –
  1.5, game 5 of 10") so I know how many games remain and what's at stake.
- As a **player**, after finishing one game in a series, I want to be taken into the next game of
  the same pairing (same opponent, same pairing/deadline context) without re-doing the
  scheduling/negotiation flow from scratch.
- As an **organizer**, I want the "race to target score with margin" mode to keep playing for as
  long as it takes to satisfy the margin, even if that means the final score ends up well above the
  configured target.

## Resolved decisions (2026-08-06)

1. **Two series modes, organizer picks per tournament** (not a single hardcoded rule):
   - **Fixed count** — pairing plays exactly N games (e.g. 10); higher total score wins the pairing.
   - **Race to margin** — games continue until one side reaches a target score (e.g. 12) *and*
     leads by a required margin (e.g. 2), à la deuce in tennis/badminton.
2. **Game scoring**: win = 1 point, draw = 0.5 point each, loss = 0 — standard tournament scoring.
   Draws count immediately toward the running score (not voided/replayed).
3. **Format scope**: the series mechanism applies uniformly across all three tournament formats
   (Swiss, Round Robin, Double Elimination) — consistent with B48 decision 4 (one shared `RuleSet`
   schema across formats).
4. **Race-to-margin is uncapped** — no safety limit on game count; it plays until the margin
   condition is met, however long that takes.
5. **Negotiation/scheduling is once per whole series**, not per individual game.
6. **Mid-series no-show forfeits the whole remaining series**, not just the current game.
7. **Color alternates and Swap2 (if enabled) re-runs every game** in the series, not just game 1.
8. **Timer is fresh per game** — no carryover between games.
9. **UI reuses room.html's spectator/chat components cosmetically only** — the backend session
   stays on `TournamentMatchHandler`, preserving the base feature's architectural separation from
   `RoomHandler`/`GameHandler`.

See [planning.md](planning.md#resolved-decisions-2026-08-06) for full rationale on each.

## Related files

- [planning.md](planning.md) — resolved decisions + implementation sequencing.
- [diagram/state-diagram-pairing-series.md](diagram/state-diagram-pairing-series.md) — pairing
  lifecycle extended with series score tracking.
- [diagram/uml_diagram/sequence-match-series-game-transition.md](diagram/uml_diagram/sequence-match-series-game-transition.md)
  — sequence for finishing one game and starting the next in the series.
- [../tournament/user_story.md](../tournament/user_story.md) — base tournament feature this extends.
