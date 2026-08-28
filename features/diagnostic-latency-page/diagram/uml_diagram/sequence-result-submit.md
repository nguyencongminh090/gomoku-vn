# Sequence — submit result

Measures nothing — persists the finished run. Context:
[../../planning.md](../../planning.md) "Submitted-result JSONL shape",
[../../user_story.md](../../user_story.md) R5/R6.

```mermaid
sequenceDiagram
    autonumber
    participant P as Player
    participant D as diag client
    participant N as /diag namespace
    participant R as utils/diag-results.js
    participant FS as server/data/diag-results/<br/>YYYY-MM-DD.jsonl
    participant LOG as prod log pipeline

    Note over D: run finished — verdicts computed by diag-report.js
    D-->>P: show results (icons) + consent line:<br/>"approx location + connection stats are saved"
    P->>D: type display name
    P->>D: tap Submit ⬆️
    D->>N: diag:submit { name, run, verdict, client, net }
    N->>N: payload size guard (<= 8 KB)
    N->>N: submit limiter (5 / IP / hour, shared with run counter)
    alt rejected (size / rate / malformed)
        N-->>D: diag:submit:err { reason }
        D-->>P: 🟡 "Could not send — {reason}"
    else accepted
        N->>N: getClientIp() (CF-Connecting-IP), CF geo label (#164)
        N->>R: record({ name, ip, geo, ua, net, client, run, verdict })
        R->>R: sanitize name (<=40, strip control chars)<br/>drop non-finite numbers, clamp ranges
        R->>R: prune files older than 90 days
        R->>FS: append one JSON line
        R->>LOG: msg="[DiagResult]" <flattened logfmt>
        R-->>N: { id }
        N-->>D: diag:submit:ok { id }
        D-->>P: ✅ "Sent — thank you"
    end
```

## Notes

- Server recomputes nothing from the client's raw samples — it stores the **aggregated**
  run the client sends, sanitized. Client timestamps never enter any timeout formula (R2).
- `[DiagResult]` logfmt line mirrors `[MoveLag]` (#164/#167) so the same grep pipeline
  works; the JSONL file is for offline percentile analysis. OQ4 decides which is primary.
- Maintainer reads via `server/scripts/diag-results.js` (CLI aggregate) — no web UI.
