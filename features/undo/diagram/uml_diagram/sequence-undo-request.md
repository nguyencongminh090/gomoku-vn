# Sequence — Undo request → approve → rollback

Illustrative only — event names (`game:undo_request`, `game:undo_applied`, etc.) and the exact
pending-state container are still open questions (see [../../planning.md](../../planning.md)
questions #1-3). Modeled on the existing `game:draw_offer`/`game:draw_accept` flow
(`server/socket/handlers/GameHandler.js:243-286`).

```mermaid
sequenceDiagram
    actor P1 as Requester (client)
    participant S as Server (GameHandler)
    participant E as GameEngine (room.gameState)
    actor P2 as Opponent (client)

    Note over P1,P2: It is the requester's turn again — opponent already replied to their last stone.

    P1->>S: game:undo_request
    S->>E: requestUndo(userId)
    alt no active game / wrong turn / opening phase / already pending
        E-->>S: { error, code }
        S-->>P1: game:error
    else valid
        E-->>S: { requested: true }
        S->>P2: game:undo_offered { from, fromName }
        S->>P1: chat:message (system, "X đề nghị hoàn tác.")
        S->>P2: chat:message (system, "X đề nghị hoàn tác.")

        alt Opponent accepts
            P2->>S: game:undo_accept
            S->>E: acceptUndo(userId)
            E->>E: pop last 2 moveHistory entries
            E->>E: board[y][x] = EMPTY for each popped move
            E->>E: moveCount -= 2, currentTurn = requester
            E-->>S: { accepted: true, cleared: [{x,y}, {x,y}], currentTurn }
            S->>P1: game:undo_applied { cleared, currentTurn, moveCount }
            S->>P2: game:undo_applied { cleared, currentTurn, moveCount }
            S->>P1: chat:message (system, "Đã hoàn tác 1 lượt.")
            S->>P2: chat:message (system, "Đã hoàn tác 1 lượt.")
            Note over P1,P2: Client clears the two board cells, restores prior stones'\nvisual state, and re-enables input for the requester's turn.
        else Opponent declines
            P2->>S: game:undo_decline
            S->>E: declineUndo(userId)
            E-->>S: { declined: true }
            S->>P1: game:undo_declined { by }
            S->>P2: game:undo_declined { by }
            S->>P1: chat:message (system, "X từ chối hoàn tác.")
            S->>P2: chat:message (system, "X từ chối hoàn tác.")
        end
    end
```

## Notes

- Mirrors the self-accept/self-decline guard already present in `acceptDraw`/`declineDraw`
  (`GameEngine.js:464`, `:485`) — the requester cannot accept/decline their own request.
- `game:undo_applied` is a **new** payload shape (cell-clearing), unlike `game:moved` which is
  fill-only (`GameHandler.js:79-85`) — see [user_story.md](../../user_story.md) precedent notes.
- Timer restoration on accept is intentionally left out of this diagram — see planning.md question #5.
