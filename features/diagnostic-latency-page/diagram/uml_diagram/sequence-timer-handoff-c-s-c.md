# Sequence — solo board move + timer handoff (client → server → client)

Measures **item 2 (board + action)** and **item 3 (timer tick c→s→c)** — the B167
discriminator. Context: [../../planning.md](../../planning.md).

Uses the **real** `BoardRenderer` + `optimisticStone` (#153) and a **real `TimerManager`**
per solo session. Bot plays a random legal move instantly so the clock hands off.

```mermaid
sequenceDiagram
    autonumber
    participant P as Player
    participant B as diag-board.js<br/>(real BoardRenderer + optimisticStone)
    participant D as DiagProbeSession
    participant N as /diag namespace
    participant T as TimerManager<br/>(real instance, this session)
    participant G as bot (random legal move)

    Note over N,T: on diag:ready — N creates GameEngine + TimerManager(mode), player = black
    T-->>D: timer:sync { serverTime, timers }
    D-->>B: render clocks (compensatedDisplay via core)

    P->>B: pointerdown on cell
    B->>B: tClick = performance.now()<br/>paint optimistic stone
    B->>B: tPaint = performance.now()  %% inputPaintMs = tPaint - tClick
    B->>D: move(cell, moveId)
    D->>N: diag:move { cell, moveId, sentAt }
    N->>G: (server) GameEngine.applyMove(black, cell)
    N->>T: applyMove('black')  %% real timer maths, monotonic
    N-->>D: diag:moved { cell, moveId, serverTime }  %% confirm
    D->>B: reconcile optimistic -> confirmed (match by coords, like #153)
    B->>B: moveConfirmMs = now - tClick

    N->>G: bot picks random empty legal cell
    N->>T: applyMove('white')
    N-->>D: game:moved { botCell }  +  timer:tick { timers, serverTime }
    D->>D: timerHandoffMs = tick recvAt - player's sentAt
    D->>B: render bot stone + updated clocks

    Note over N: per accepted solo move, server logs one<br/>msg="[DiagResult move]" spent_ms=.. half_rtt_ms=..<br/>(drift-sized vs RTT-sized — the B167 call)
```

## Notes

- `spent_ms` measured server-side with `process.hrtime.bigint()` at turn switch (identical
  method to B167 `move-lag.js`), **not** `Date.now()`.
- Optimistic reconcile keys on **coordinates via `game:moved`**, not the ack — same
  reasoning as fix-log #153 (broadcast always precedes ack on the same connection).
- No turn-watchdog / resync here (out of scope, R "Out of scope") — a dropped packet just
  ends the run early with a "connection unstable" verdict.
- `moveId` = client-generated uuid, server dedupes — same contract as room `game:move`
  (#152), so the board module needs no diag-specific change.
