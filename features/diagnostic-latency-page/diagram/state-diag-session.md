# State — diagnostic session lifecycle

Client-side `DiagProbeSession` + the paired server `/diag` session. Context:
[../planning.md](../planning.md), [../user_story.md](../user_story.md).

```mermaid
stateDiagram-v2
    [*] --> Landing
    Landing --> Connecting : tap "Start test"
    Connecting --> Denied : diag:denied (rate_limited)
    Connecting --> Warmup : diag:ready
    Denied --> Landing : "try again later"

    Warmup --> Probing : first diag:pong received
    note right of Warmup
        server: create GameEngine + real TimerManager(mode)
        client: subscribe timer:sync
    end note

    Probing --> Playing : board ready, clocks rendered
    Playing --> Probing : (probes + moves interleave for ~60 s)

    state "Measuring (~60s)" as M {
        Probing
        Playing
    }

    M --> Aborted : socket drop / packet-loss threshold
    M --> Finished : duration elapsed & min samples met
    M --> Finished : player taps "Stop early" (if >= min samples)
    M --> AbortedShort : player leaves early (< min samples)

    Aborted --> Results : partial verdict ("connection unstable")
    AbortedShort --> Landing : nothing to submit
    Finished --> Results : diag-report.js computes verdicts

    Results --> Submitting : type name + tap Submit (consent shown)
    Submitting --> Results : diag:submit:err (retry allowed)
    Submitting --> Done : diag:submit:ok
    Done --> [*]

    Results --> [*] : player closes without submitting
```

## Guards / invariants

- **min samples**: ≥ 30 transport probes AND ≥ 8 board moves → `Finished`; otherwise
  `AbortedShort`.
- One active session per socket; a second `Start` on the same socket is rejected server-
  side.
- The real `TimerManager` instance is destroyed on `Aborted` / `Finished` / disconnect —
  no lingering timers (mirrors room cleanup).
- Rate-limit counter increments on entering `Warmup` (a started run counts), not on submit,
  so 5 abandoned runs still exhaust the hour's budget (anti-abuse, R5).
