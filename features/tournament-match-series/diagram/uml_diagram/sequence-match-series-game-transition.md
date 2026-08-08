# Sequence — Finishing One Game, Starting the Next in the Series

Illustrates the open question of how `TournamentMatchHandler`/`TournamentManager` would need to
react when a game inside a series ends but the pairing isn't decided yet (see
[../../planning.md](../planning.md)). This is a **proposed** flow, not yet implemented or confirmed
— contrast with [../../tournament/diagram/uml_diagram/sequence-match-scheduling.md](../../tournament/diagram/uml_diagram/sequence-match-scheduling.md)
which documents the already-built single-game flow.

```mermaid
sequenceDiagram
    participant P1 as Player 1
    participant P2 as Player 2
    participant MH as TournamentMatchHandler
    participant TM as TournamentManager
    participant PL as PairingLifecycle

    Note over P1,P2: Game N of the series ends (five-in-a-row/resign/draw/timeout)
    MH->>TM: recordGameResult(pairingId, gameNResult)
    TM->>PL: applyGameResult(pairing, gameNResult)
    PL->>PL: push game result into pairing.games[]<br/>update pairing.seriesScore
    PL->>PL: evaluate series-decided? (fixed count / race-to-margin)

    alt series decided
        PL-->>TM: { seriesComplete: true, winnerEntryId }
        TM->>TM: pairing.state = Completed
        TM-->>MH: emit pairing_changed (Completed)
        MH-->>P1: tmatch:ended (series result)
        MH-->>P2: tmatch:ended (series result)
    else series continues
        PL-->>TM: { seriesComplete: false, nextGameIndex }
        TM->>TM: pairing.state = Ready (or straight back to InProgress — open question)
        TM-->>MH: emit pairing_ready (next game)
        MH->>MH: instantiate fresh GameEngine for game N+1<br/>(fresh TimerManager per decision 7 of base feature)
        MH-->>P1: tmatch:started (game N+1, running score shown)
        MH-->>P2: tmatch:started (game N+1, running score shown)
    end
```
