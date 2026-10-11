# Friend challenge — state

```mermaid
stateDiagram-v2
  [*] --> Pending: send
  Pending --> Expired: TTL
  Pending --> Declined: decline/cancel
  Pending --> Playing: accept
  Playing --> Playing: game ends, series undecided
  Playing --> Settled: series decided
  Settled --> [*]: swap Elo applied if stake
```
