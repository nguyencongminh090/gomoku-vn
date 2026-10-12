# Rating integrity — flag state

```mermaid
stateDiagram-v2
  [*] --> Clean
  Clean --> Flagged: job score over threshold
  Flagged --> Clean: admin dismisses
  Flagged --> Confirmed: admin confirms
  Confirmed --> Clean: admin reverses
  Confirmed --> [*]: rating corrected + logged
```
