# Structure & Behavior Diagram — Match Lifecycle (State Machine)

Behavioral counterpart to [uml_diagram/sequence-match-scheduling.md](uml_diagram/sequence-match-scheduling.md):
the states a single paired match moves through, independent of message order.

```mermaid
stateDiagram-v2
    [*] --> Paired: Server pairs two players for the round

    Paired --> Negotiating: Players notified of pairing
    Negotiating --> Reported: One/both players submit agreed time

    Reported --> Ready: Organizer confirms or dispute resolved
    Reported --> Reported: Dispute raised, organizer resolves time

    Ready --> InProgress: Both players marked ready before deadline
    Ready --> Walkover: Only one player ready by deadline
    Ready --> DoubleNoShow: Neither player ready by deadline

    InProgress --> Completed: Server tracks clock, computes result

    Completed --> [*]
    Walkover --> [*]
    DoubleNoShow --> [*]

    Reported --> OrganizerAdjusted: Organizer manually rearranges/releases pairing
    OrganizerAdjusted --> [*]

    note right of Walkover
        Absent player scores 0 for round.
        Present player wins, no penalty.
        Punishment scope beyond round loss: TBD (planning.md)
    end note

    note right of DoubleNoShow
        Outcome undefined in current spec:
        double walkover vs. void/replay vs.
        organizer case-by-case. See planning.md.
    end note
```

## Class-level structure (conceptual, pre-implementation)

Entities implied by the states above — **not** a finalized data model, just enough structure to
reason about the diagram. Actual schema is deferred to implementation planning.

```mermaid
classDiagram
    class Tournament {
        format: Swiss | RoundRobin | DoubleElimination
        rules: RuleSet
        status: draft | active | completed
    }
    class RuleSet {
        boardRules
        timeControl
        schedulingWindow
        walkoverPolicy
        tiebreakRules
    }
    class Round {
        index: int
        deadline: datetime
    }
    class Pairing {
        state: Paired | Negotiating | Reported | Ready | InProgress | Completed | Walkover | DoubleNoShow | OrganizerAdjusted
        agreedTime: datetime
        result
    }
    class Player
    class Organizer

    Tournament "1" --> "1" RuleSet
    Tournament "1" --> "*" Round
    Round "1" --> "*" Pairing
    Pairing "1" --> "2" Player
    Tournament "1" --> "1" Organizer : managed by
```
