# Sequence — transport latency probe (`diag:ping` / `diag:pong`)

Measures **item 1 (latency)**: half-RTT percentiles, clock offset + drift, packet loss.
Context: [../../planning.md](../../planning.md) "What the page measures".

Dedicated path — does **not** touch the room, auth, or engine.io heartbeat.

```mermaid
sequenceDiagram
    autonumber
    participant P as Reporting player
    participant D as DiagProbeSession<br/>(client/js/diag)
    participant C as timer-sync-core.js<br/>(pure)
    participant N as /diag namespace<br/>(server, no auth)

    P->>D: tap "Start test"
    D->>N: connect socket (namespace /diag)
    N->>N: IP limiter check (5 runs / IP / hour)
    alt limit exceeded
        N-->>D: diag:denied { reason:"rate_limited" }
        D-->>P: 🔴 "Try again later"
    else allowed
        N-->>D: diag:ready { sessionId }
        loop every 500 ms for ~60 s (>=30 samples)
            D->>D: t0 = performance.now()
            D->>N: diag:ping { seq }
            N->>N: srvMono = process.hrtime.bigint()<br/>srvWall = Date.now()
            N-->>D: diag:pong { seq, srvWall, srvMonoDelta }
            D->>D: t1 = performance.now()<br/>rttSample = t1 - t0
            D->>C: halfRttEma(prev, rttSample/2)
            C-->>D: halfRttMs
            D->>C: clockOffset(srvWall, recvWallNow)
            C-->>D: offsetSample
            D->>D: accumulate percentiles (p50/p90/p99/jitter)<br/>track seq gaps -> packetLossPct
        end
        D->>D: finalize offset drift = linreg(offsetSamples over t)
        D-->>P: live gauge updates (icon only)
    end
```

## Notes

- `halfRttEma` / `clockOffset` are the **same** functions the room uses (R4) — extracted to
  `timer-sync-core.js` in sequencing step 1.
- Cadence (500 ms) is a probe choice, **not** a change to `pingInterval` — the #147/#152
  trap ("don't tighten pingInterval to measure better") does not apply because this is a
  separate namespace with its own message type.
- `srvMonoDelta` lets the client detect a server-side pause between receive and send
  (should be ~0); large values are dropped like B165 drops >30 s samples.
