# State Diagram — Pairing with Game Series

Extends the base pairing lifecycle (`PairingLifecycle.js`: `Paired -> Negotiating -> ... -> Ready ->
InProgress -> Completed`, see [../../tournament/diagram/state-diagram-match-lifecycle.md](../../tournament/diagram/state-diagram-match-lifecycle.md))
by looping `Ready <-> InProgress` for each individual game in the series, instead of ending the
pairing after one game.

```mermaid
stateDiagram-v2
    [*] --> Paired
    Paired --> Negotiating: announcePairing
    Negotiating --> Ready: both players check in (per series, once)
    Ready --> InProgress: game N starts (fresh TimerManager per game)

    state InProgress {
        [*] --> GameOngoing
        GameOngoing --> GameEnded: five-in-a-row / resign / draw / timeout
    }

    InProgress --> SeriesCheck: game N ends, running score updated

    state SeriesCheck <<choice>>
    SeriesCheck --> Ready: series not decided yet (score/margin/count not met) — start game N+1
    SeriesCheck --> Completed: series decided (fixed count reached, or race-to-margin clinched)

    Completed --> [*]

    note right of SeriesCheck
      Fixed-count mode: decided once game count == N.
      Race-to-margin mode: decided once
      max(scoreA, scoreB) >= target AND |scoreA - scoreB| >= margin,
      OR the safety-cap game count is reached (open question,
      see planning.md).
    end note
```

Unresolved in this diagram (tracked as open questions in [../planning.md](../planning.md)):

- Whether scheduling/deadline negotiation (`Paired -> Negotiating -> Ready`) happens once per
  pairing or is re-entered before each game in the series.
- Whether a no-show mid-series ends only that game (walkover for that game, series continues) or
  ends the whole pairing (walkover for the series).
