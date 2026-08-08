# Sequence Diagram — Self-Scheduled Match Flow

Covers the "World Blitz Cup"-style flow: players negotiate a time between themselves, report it to
the server, then check in when ready. See [user_story.md](../../user_story.md) for the story this
diagram illustrates, and [../state-diagram-match-lifecycle.md](../state-diagram-match-lifecycle.md)
for the resulting match states.

```mermaid
sequenceDiagram
    actor P1 as Player 1
    actor P2 as Player 2
    participant Srv as Server
    actor Org as Organizer

    Srv->>P1: Pair announced (round N, opponent P2)
    Srv->>P2: Pair announced (round N, opponent P1)

    Note over P1,P2: Negotiate match time outside the platform

    P1->>Srv: Report agreed match time
    Srv-->>P2: Notify: proposed time reported

    alt P2 confirms same time
        P2->>Srv: Confirm match time
        Srv-->>P1: Time confirmed
    else P2 disagrees
        P2->>Srv: Dispute proposed time
        Srv-->>Org: Escalate scheduling dispute
        Org->>Srv: Resolve / set final time
        Srv-->>P1: Final time set
        Srv-->>P2: Final time set
    end

    Note over P1,P2: Wait until agreed time

    par Player 1 checks in
        P1->>Srv: Mark ready
    and Player 2 checks in
        P2->>Srv: Mark ready
    end

    alt Both ready before deadline
        Srv->>P1: Match started
        Srv->>P2: Match started
        Note over Srv: Server tracks clock, computes result
        Srv-->>Org: Result recorded
    else Only one ready by deadline
        Srv-->>Org: Walkover — absent player scores 0
        Srv-->>P1: Result: walkover (no penalty to present player)
    else Neither ready by deadline
        Srv-->>Org: Double no-show (resolution TBD — see planning.md)
    end
```
