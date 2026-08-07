# Sequence — Organizer Cancels a Tournament

Covers the full fan-out from one `tournament:cancel` call: authorization, force-terminating every
non-terminal pairing (including tearing down a live match), partial standings, and broadcasting the
result to every affected client (the organizer, players mid-game, players/spectators just watching,
and the lobby list).

```mermaid
sequenceDiagram
    actor Organizer
    participant Client as tournament.html / tournaments.js
    participant Handler as TournamentHandler
    participant Mgr as TournamentManager
    participant PL as PairingLifecycle
    participant MatchH as TournamentMatchHandler
    participant State as tournamentState
    participant DB as database
    participant Room as tournament-match:<pairingId> room
    participant Lobby as lobby / tournament room clients

    Organizer->>Client: click "Huỷ giải đấu" + confirm (optional reason)
    Client->>Handler: emit tournament:cancel {tournamentId, reason}
    Handler->>Mgr: cancelTournament(organizerId, tournamentId, reason)

    Mgr->>Mgr: check tournament.organizerId === organizerId
    alt not organizer
        Mgr-->>Handler: {error, code: ORGANIZER_ONLY}
        Handler-->>Client: tournament:error
    else status is completed or already cancelled
        Mgr-->>Handler: {error, code: INVALID_STATE}
        Handler-->>Client: tournament:error
    else authorized, draft or active
        Mgr->>Mgr: enumerate all pairings for tournamentId
        loop each non-terminal pairing
            alt pairing.state === InProgress (live match)
                Mgr->>MatchH: teardownLiveMatch(pairingId, reason)
                MatchH->>Room: emit tmatch:ended {reason: tournament_cancelled}
                MatchH->>Room: socketsLeave(matchRoom)
                MatchH->>Mgr: _teardownPairingTimer(pairingId)
                MatchH->>State: tournamentGameMap.delete(pairingId)
                MatchH->>State: untrack pending deadline (if any)
            else Paired / Negotiating / Reported / Ready
                Mgr->>PL: force-terminate pairing (new Cancelled state)
            end
            Mgr->>DB: savePairing(pairing)
        end
        Mgr->>Mgr: compute partial standings (Completed pairings only)
        Mgr->>DB: updateTournamentStatus(tournamentId, 'cancelled', {cancelledAt, cancelReason})
        Mgr->>Mgr: emit('tournament_cancelled', tournamentId)
        Mgr-->>Handler: {tournament, standings: partial}
        Handler->>Lobby: broadcast tournament:cancelled {tournament, standings}
        Lobby-->>Client: update card/detail badge to "Đã huỷ", hide organizer/register actions
    end
```

## Notes

- The `InProgress` branch is the only one requiring live socket/timer teardown — every other
  non-terminal state (`Paired`/`Negotiating`/`Reported`/`Ready`) has no active `GameEngine`/
  `TimerManager` yet, so force-terminating them is a pure state-field mutation, no socket work.
- `tmatch:ended`'s `reason: tournament_cancelled` (vs. reusing a brand-new event name) is an open
  question — see [../planning.md](../planning.md#open-questions-non-blocking--can-default-and-adjust-later)
  question 2.
- The broadcast target ("Lobby" in the diagram) needs to reach three distinct client contexts that
  may all be open simultaneously: (1) the organizer's own tab, (2) any player/visitor sitting on
  `tournament.html` for this tournament (already joined `tournamentRoom(tournamentId)` via
  `tournament:get`), and (3) the lobby list (`tournaments.js`) showing this tournament's card to
  everyone browsing — verify at implementation time which existing room/channel already covers all
  three, or whether more than one emit target is needed.
