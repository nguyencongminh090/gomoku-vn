# Diagnostic Latency Page — user story

> Pre-implementation discussion. A `features/<slug>/` folder does **not** authorize
> implementation — see [planning.md](planning.md) open questions first.

Related work: B165 (timer transit-delay compensation, display-only), B166 (same, mobile
players-strip), B167 (server-side move-lag measurement harness — this page becomes its
production sample source). See [planning.md](planning.md) §"Relationship to B167".

## Problem

The team cannot get real latency numbers from the players who actually hit the timer bugs
(China #155, USA+VPN #165). Every attempt to reproduce fails on the same wall:

- Chromium/CDP `Network.emulateNetworkConditions` **cannot throttle WebSocket frames**
  (fix-log #153, #165, #126) — only `fetch()`.
- There is no channel to the reporting players to ask them to run anything.
- B165's fix-log carries an explicit honesty gap: production transit delay `d` "chưa đo
  được bằng số".
- B167 Step 1 is blocked: *"chờ mẫu production"*.

## Solution

An **unlisted** URL (`/diag`) a reporting player opens on their real network. It measures —
without playing a real ranked game — the exact quantities B165/B167 reason about, then lets
the player submit the result back to the server for the team to analyse.

## Actors

| Actor | Role |
|---|---|
| **Reporting player** (non-technical, possibly non-VN, high latency) | Opens the unlisted URL, types a name, runs the test, taps submit. Must understand nothing about RTT/timers. |
| **Diagnostic client** (`client/diagnostic.html` + `client/js/diag/*`) | Runs the probe loop, drives a solo board vs a random-move bot, renders results as plain-language verdicts + icons. |
| **`/diag` socket namespace** (`server/socket/diag-namespace.js`) | No auth middleware. Echoes probes with server timestamps, runs a real `TimerManager` per solo session, drives the random-move bot, persists submissions. |
| **Team / maintainer** | Reads `server/data/diag-results/*.jsonl` + `[DiagResult]` log lines to close or advance B167. |

## User stories

1. **As a reporting player**, I open the link the maintainer gave me, and I see one screen
   with a big "Start test" button and a short plain-language explanation — no login, no
   jargon.
2. **As a reporting player**, I type my display name (the one I use in the game) so the team
   can match my result to my complaint.
3. **As a reporting player**, I run a ~60s test where I place stones on a board against an
   instant bot while a clock ticks, mirroring how a real game feels.
4. **As a reporting player**, I see results as plain verdicts with icons ("Your connection
   to the server: 🟢 good / 🟡 slow / 🔴 very slow", "Clock accuracy: …") — not a table of
   milliseconds.
5. **As a reporting player**, I tap one button to send my result to the team, and I see a
   confirmation. I am told once, before submitting, that my approximate location and
   connection stats are saved.
6. **As the team**, I read the submitted JSONL / log lines and can tell whether the timer
   loss a player reported is drift-sized (B165 covers it → close B167) or RTT-sized
   (→ B167 Step 2, bounded refund).
7. **As a maintainer editing room timer mechanics**, a path-scoped rule reminds me to keep
   the diagnostic page's shared core (`timer-sync-core.js`) and the measured quantities in
   sync with the room.

## Rules / hard constraints

- **R1 — No auth.** `/diag` namespace bypasses the socket auth middleware. It must be
  fully isolated from authenticated socket state (no `socket.user`, no room registry, no
  main rate-limiter). Its own limiter only.
- **R2 — Server is still the only clock authority.** The page *measures*; it never feeds
  client timestamps into any timeout formula. Same rule as B167.
- **R3 — Isolation from main pages.** No file under `client/js/*` that a main page loads
  may change behaviour. The only permitted shared code is a **new** pure module
  (`timer-sync-core.js`) that main code is refactored to *import* — extraction only, no
  logic change, covered by a conformance test. Everything else under `client/js/diag/`.
- **R4 — Fidelity.** Transport probe uses a dedicated `diag:ping`/`diag:pong`; the solo
  board + timer use the **real** `BoardRenderer`, `optimisticStone`, and a real
  `TimerManager` instance server-side. No re-implementation of timer maths.
- **R5 — Abuse limits.** Max **5 test runs per IP per hour**; one active run per socket;
  payload hard-capped (~8 KB); submissions rate-limited the same way.
- **R6 — Privacy.** One consent line shown before submit. Stored: sanitized name, IP
  (`getClientIp()` / CF-Connecting-IP), CF geo label, `navigator.connection` snapshot, UA,
  and aggregate run stats. Retention: JSONL files auto-pruned after **90 days**.
- **R7 — Unlisted.** No link from the main app nav or lobby. The maintainer shares the URL
  directly. (Login-page footer link explicitly rejected.)
- **R8 — UI: Zen Minimal**, layout per the `ui-ux-pro-max` skill, **icons instead of
  text** wherever a glyph carries the meaning. Built for a non-technical user. Desktop +
  mobile layouts, VN + EN via existing `client/js/i18n.js`.
- **R9 — Bot plays random legal moves**, replying instantly so the clock hands off
  black↔white and the c→s→c timer-tick cycle is exercised for real.
- **R10 — Sync rule.** A path-scoped `.claude/rules/diagnostic-page-sync.md` loads when
  editing `server/managers/TimerManager.js`, `client/js/room-socket.js`,
  `client/js/game-ui.js`, `client/js/timer-sync-core.js`, or `client/js/diag/**` — listing
  what must be re-verified against the room.

## Out of scope

- Turn-watchdog / resync machinery (#152/#154) — measure-only page, not a resilience test.
- Any change to `tournament-match.js` (already deferred in B165/B166).
- Ranked/real-room diagnostics (a future `RoomProbeSession` — the base class leaves room
  for it, we don't build it).
- A viewer UI for submitted results — a read script (`server/scripts/diag-results.js`) is
  enough.
