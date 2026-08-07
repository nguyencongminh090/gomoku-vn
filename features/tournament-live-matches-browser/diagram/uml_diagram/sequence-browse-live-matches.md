# Sequence — Visitor Browses and Joins a Live Tournament Match

Covers the new discovery layer (live-matches browser) feeding into the already-existing, unmodified
spectate flow (`tmatch:subscribe`).

```mermaid
sequenceDiagram
    actor Visitor
    participant Lobby as tournaments.html (live-matches panel)
    participant Handler as TournamentHandler / TournamentMatchHandler
    participant State as tournamentState.tournamentGameMap
    participant MatchPage as tournament-match.html
    participant Room as tournament-match:<pairingId> room

    Visitor->>Lobby: open lobby / live-matches panel
    Lobby->>Handler: emit tournament:list_live_matches (new)
    Handler->>State: aggregate tournamentGameMap entries\n(+ tournament name, player names, series info, spectator count)
    Handler-->>Lobby: tournament:live_matches {matches: [...]}
    Lobby->>Visitor: render list (tournament, players, progress, spectators)

    par match starts elsewhere
        Handler->>Lobby: broadcast tournament:live_matches_changed
        Lobby->>Handler: re-request / receive delta
        Lobby->>Visitor: list updates in place
    and match ends elsewhere
        Handler->>Lobby: broadcast tournament:live_matches_changed
        Lobby->>Visitor: stale entry removed
    end

    Visitor->>Lobby: click a live match entry
    Lobby->>MatchPage: navigate goToMatch(pairingId)\n(existing tournament-detail.js function, unchanged)

    Note over MatchPage,Room: Everything from here is the EXISTING,\nalready-working spectate flow — unmodified.
    MatchPage->>Handler: emit tmatch:subscribe {tournamentId, pairingId}
    Handler->>State: tournamentGameMap.get(pairingId)
    Handler->>Room: socket.join(matchRoom)
    Handler-->>MatchPage: tmatch:init {gameState, timerSync, series}
    Handler->>Room: broadcast tmatch:presence (spectator count +1)
    MatchPage->>Visitor: render board, no action buttons (myColor === null)
```
