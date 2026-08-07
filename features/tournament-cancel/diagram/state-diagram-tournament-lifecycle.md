# State Diagram — Tournament Lifecycle with Cancellation

Extends the base tournament lifecycle (`draft -> active -> completed`, `TournamentManager.js:104`,
`startTournament()`, `_completeTournament()`) with a fourth terminal status, `cancelled`, reachable
from either pre-completion state.

```mermaid
stateDiagram-v2
    [*] --> draft: createTournament (organizer)
    draft --> active: startTournament (organizer-only)
    active --> completed: all rounds/bracket resolved\n(natural completion, unchanged)

    draft --> cancelled: cancelTournament (organizer-only)
    active --> cancelled: cancelTournament (organizer-only)

    completed --> [*]
    cancelled --> [*]

    note right of cancelled
      Force-terminates every non-terminal pairing
      (see sequence-cancel-tournament.md).
      Partial standings computed from pairings
      that reached Completed before cancellation.
      Terminal — no transition back to active/draft.
    end note
```

Not reachable: `completed -> cancelled` (a finished tournament can't retroactively be cancelled) and
`cancelled -> cancelled` (idempotent guard — the second cancel attempt is rejected, not a no-op
transition).
