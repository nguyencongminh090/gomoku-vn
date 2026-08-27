# State — predicted turn/timer overlay lifecycle

Mirrors `optimisticStone`'s lifecycle (board.js) but for the turn-bar/timer render layer proposed in
[../planning.md](../planning.md) Q2. Never mutates `gameState.currentTurn` — purely a render-time
override, same separation principle as the stone overlay.

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> Predicted: sendMove() — local pre-check passed
    Predicted --> Idle: ack {error} → clear, updateBoardState() from true gameState
    Predicted --> Idle: game:ended race → clear, stop timers
    Predicted --> Idle: ack timeout #2 → resync → room:joined rebuild clears it
    Predicted --> Confirmed: game:moved matching moveId/coords → snap timers to server timerValues
    Confirmed --> Idle: next render tick (no visible difference — turn already matched prediction)
```
