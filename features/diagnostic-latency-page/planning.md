# Diagnostic Latency Page — planning

> Open questions + resolutions + implementation sequencing. Nothing here authorizes code —
> once the open questions are **all** resolved, formalize into
> `docs/todo/<CODE>-<slug>.md` + `TODO.md` and `docs/instruction/<CODE>-<slug>.md` +
> `instruction.md` before writing implementation code (project rule).

See also: [user_story.md](user_story.md) · diagrams under
[diagram/](diagram/) and [diagram/uml_diagram/](diagram/uml_diagram/).

---

## Resolved (architect discussion 2026-08-28)

| # | Question | Resolution |
|---|---|---|
| 1 | Auth boundary | **Unauthenticated.** Ask for the player's display name, record the run, add a submit-result button that persists to a server folder. |
| 2 | Server support: reuse vs dedicated | **Dedicated** `/diag` namespace, emphasis on *measurement*. Solo board mode for the play surface. Code organized as: shared pure `timer-sync-core.js` + abstract `LatencyProbeSession` base class + `DiagProbeSession` subclass; board composes real `BoardRenderer`/`optimisticStone`; server instantiates a **real `TimerManager`** per session. |
| 3 | Feed B167? | **Yes** — this page becomes B167 Step 1's production sample source. B167 task doc to be updated at formalization: harness `[MoveLag]` + this page's `[DiagResult]` together supply the sample. |
| 4 | Refactor permission | **Granted, isolated.** Extraction only of timer-sync maths into `timer-sync-core.js`; main pages only gain an `import`. Conformance test guards against a divergent copy. No behaviour change to main pages. |
| 5 | Sync rule location | **(b)** path-scoped `.claude/rules/diagnostic-page-sync.md`. |
| 6 | Layout + i18n | **Yes** — desktop + mobile, VN + EN. |
| 7 | Privacy / consent / retention | **Accepted.** One consent line before submit; JSONL auto-pruned after 90 days. |
| 8 | Solo board timer handoff | **Bot plays random legal moves, replies instantly** so the clock hands off and the c→s→c tick cycle is measured. |
| 9 | Abuse limits | **5 test runs / IP / hour**; 1 active run per socket; ~8 KB payload cap; `/diag` isolated from the main socket rate-limiter. |
| 10 | Discoverability | **Unlisted URL.** No nav link, no login-page footer link. Maintainer shares it directly. |
| 11 | UI style | **Zen Minimal**, layout per `ui-ux-pro-max` skill, **icons instead of text**, built for a non-technical user. |

---

## What the page measures (maps to the user's list)

| User's item | Measured quantity | How | Reported as (plain language + icon) |
|---|---|---|---|
| **Latency** | transport half-RTT: p50 / p90 / p99 / min / max / jitter | `diag:ping` → server stamps `hrtime` + `Date.now()` → `diag:pong`; EMA identical to `timer-sync-core.halfRttEma` | "Connection to server" 🟢/🟡/🔴 |
| **Latency** | clock offset + drift over the run | `clockOffset(serverTime, recvTime)` sampled each probe | "Clock accuracy" |
| **Latency** | packet-loss estimate | sequence gaps in `diag:ping` acks | "Connection stability" |
| **Click speed / delay** | pointerdown → optimistic stone painted (client-only) | `performance.now()` around `optimisticStone` | "Your device response" |
| **Click speed / delay** | click → server-confirmed move (`diag:move` echo) | round-trip on the real board path | "Move confirmation time" |
| **Timer tick (c→s→c)** | full handoff: your move → server applies to real `TimerManager` → bot random move → `timer:tick` back to you | dedicated solo session with instant random bot | "Timer fairness" — **the B167 discriminator** |
| — | `spent_ms` floor (think-time ~0 moves) vs half-RTT — is timer loss **drift-sized (→B165 enough)** or **RTT-sized (→B167 Step 2)** | server logs both per solo move, `[DiagResult]` line | (team-facing, not shown to player) |

Run length: **~60 s continuous** (target ≥ 30 transport samples + ≥ 8 board moves).

---

## Code organization (resolves Q2 "Interface and Inherit")

```
client/js/
  timer-sync-core.js         NEW — pure. halfRttEma(), compensatedDisplay(), clockOffset().
                             Extracted verbatim from room-socket.js tickLocal /
                             game-ui.js recordMoveRtt. Room code refactored to import it.
  room-socket.js             CHANGED (import only, no logic change)
  game-ui.js                 CHANGED (import only, no logic change)
  diag/
    latency-probe-session.js NEW — abstract base. Owns sample loop, EMA (via core),
                             percentile accumulator, stop conditions.
                             Subclass hooks: _send(payload), _onEcho(serverStamp).
    diag-probe-session.js    NEW — concrete. Rides diag:ping/diag:pong.
    diag-board.js            NEW — composes real BoardRenderer + optimisticStone,
                             solo vs instant random bot.
    diag-report.js           NEW — turns raw percentiles into verdict + icon + i18n key.
    diag-entry.js            NEW — page bootstrap.
  (future) room-probe-session.js  NOT built now — base class leaves the seam.

client/
  diagnostic.html            NEW — Zen Minimal, unlisted.

server/
  socket/diag-namespace.js   NEW — /diag, no auth mw, own limiter (5/IP/h),
                             diag:ping echo, diag:move (+ instant random bot via
                             real GameEngine), diag:submit (persist), real TimerManager
                             per session.
  utils/diag-results.js      NEW — sanitize + append JSONL + emit [DiagResult] logfmt +
                             90-day prune on write.
  scripts/diag-results.js    NEW — CLI aggregate/read.
  data/diag-results/         NEW dir (gitignored) — YYYY-MM-DD.jsonl

.claude/rules/diagnostic-page-sync.md   NEW — path-scoped (see R10 in user_story.md).
```

### Submitted-result JSONL shape (one line per submission)

```json
{
  "id": "uuid-v4",
  "ts": "2026-08-28T09:30:00.000Z",
  "name": "sanitized, <=40 chars, no control chars",
  "ip": "1.2.3.4",
  "geo": "US",
  "ua": "Mozilla/5.0 ...",
  "net": { "effectiveType": "4g", "downlink": 8.4, "rtt": 100, "saveData": false },
  "client": { "assetVersion": 166, "tz": "America/Los_Angeles", "viewport": "390x844" },
  "run": {
    "durationMs": 60123,
    "transportSamples": 44,
    "boardMoves": 9,
    "halfRttMs":      { "p50": 0, "p90": 0, "p99": 0, "min": 0, "max": 0, "jitter": 0 },
    "clockOffsetMs":  { "p50": 0, "driftMsPerMin": 0 },
    "packetLossPct":  0,
    "inputPaintMs":   { "p50": 0, "p90": 0 },
    "moveConfirmMs":  { "p50": 0, "p90": 0, "p99": 0 },
    "timerHandoffMs": { "p50": 0, "p90": 0, "p99": 0 },
    "spentFloorMs":   { "p50": 0 }
  },
  "verdict": { "connection": "yellow", "clock": "green", "stability": "green" }
}
```

`[DiagResult]` log line = same fields flattened to logfmt, `msg="[DiagResult]"`, so the
team's existing `grep` pipeline (as with `[MoveLag]`, #164/#167) picks it up.

---

## Relationship to B167

B167 Step 1 harness (`server/utils/move-lag.js`, `LOG_MOVE_LAG`) found `half_rtt_ms` from
engine.io ping/pong is **too sparse** (25 s interval) to cover a normal game, and added a
`crtt` cross-check field. This page fixes coverage a different way: a **dedicated probe at
whatever cadence we choose**, run by exactly the high-latency players B167 needs, with the
solo move path logging `spent_ms` vs half-RTT per move against a real `TimerManager`.

**Formalization action:** update `docs/todo/B167-*.md` + `docs/instruction/B167-*.md`:
- Add this page as the sanctioned Step-1 sample channel.
- Keep the "server is the only clock authority / clientTs is cross-check only" spec
  unchanged.
- Do **not** merge the two tasks — B167 stays the "should we build bounded refund?"
  decision; this page is the instrument.

---

## Open questions

- **OQ1 — Bot legality source.** Reuse `server/managers/GameEngine.js` for legal-move
  generation in the `/diag` solo session (true fidelity, but pulls GameEngine into an
  unauthenticated namespace), or a minimal standalone "any empty cell" picker (simpler,
  isolated, but not rule-accurate for portal/wall variants)? Default variant only, or let
  the player pick a mode? — *needs decision before formalization.*
- **OQ2 — Which timer modes.** Offer `per_game` / `blitz` / `per_move` selection, or hard-
  code one representative mode (e.g. `per_move` 60 s, the reported-bug default)? More modes
  = more coverage but more UI for a non-tech user (conflicts R8/"best for non-tech").
- **OQ3 — Name uniqueness / matching.** Player types a free-text name. Do we also capture a
  short "what went wrong" free-text field (one line, sanitized) so the submission carries
  the complaint, or keep it pure-numbers? Privacy line already covers stored text.
- **OQ4 — `[DiagResult]` vs JSONL as source of truth.** Both are written. If the prod log
  pipeline already aggregates logfmt, is the JSONL file redundant, or is it the primary
  and the log line the convenience? (Affects whether `data/diag-results/` needs the prune
  job or just the log retention.)
- **OQ5 — Asset version / cache.** New `client/css` + `client/js` files → `?v=N` bump
  across the whole repo per CLAUDE.md. Confirm the diagnostic page participates in the
  shared `?v=N` (yes by default; the mockup exception doesn't apply).
- **OQ6 — CSP.** `diagnostic.html` needs the same strict CSP as the rest of the app
  (`server/config/csp.js`). Any new inline handlers? (Design target: none — external
  modules only, same as post-#155.)
- **OQ7 — Test infrastructure.** Server side gets Jest (`diag-namespace`, `diag-results`
  sanitize/prune, bot legality, `TimerManager` handoff). `timer-sync-core.js` gets unit
  tests + the conformance test. `client/js/diag/**` has no runner — verify via
  `playwright-e2e-safety`-compliant isolated instance. Confirm this split is acceptable
  and note the client gap explicitly (per CLAUDE.md).

---

## Implementation sequencing (after OQs resolved + formalized)

1. **Extract `timer-sync-core.js`** from room code; refactor `room-socket.js` +
   `game-ui.js` to import; add unit tests + conformance test. `npm test` green, `?v=` bump,
   verify room timer behaviour unchanged in a real browser. *(This is the riskiest step —
   ship it as its own commit / fix.)*
2. **`/diag` namespace + `diag-results.js`** server-side: ping echo, submit persist +
   logfmt + prune, IP limiter. Jest.
3. **Solo board + instant random bot + real `TimerManager`** in `/diag`. Jest for handoff
   + bot legality.
4. **`LatencyProbeSession` base + `DiagProbeSession`** client module. Unit tests for the
   percentile accumulator + EMA parity with core.
5. **`diagnostic.html` + `diag-report.js`** — Zen Minimal UI via `design-workflow` /
   `ui-ux-pro-max`, icons, VN/EN, desktop + mobile. Consent line.
6. **`.claude/rules/diagnostic-page-sync.md`** path-scoped rule.
7. **Update `docs/todo/B167-*` + `instruction`** to reference this page as Step-1 channel.
8. End-to-end verification on an **isolated** instance (`playwright-e2e-safety`): run the
   full 60 s test, submit, confirm JSONL + log line, confirm limiter at the 6th run,
   confirm main pages/rooms unaffected.
