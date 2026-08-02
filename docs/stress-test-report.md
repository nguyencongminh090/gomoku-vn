# Stress Test Report — Concurrent Player Capacity

**Date:** 2026-08-02
**Scope:** TEST-MATRIX.md row 35 ("Heavy load test bench")
**Status:** §1-7 are the original exploratory single-process measurement (not a committed regression test — see "What this is / isn't"). §9 is a verified re-test with a real multi-process harness (`scripts/capacity-test/`, permanent and re-runnable) that supersedes the original ramp's unverified numbers with an actual measured boundary (~3000 concurrent players clean, degrading ~3200+).

## 1. Objective

Answer a simple operational question: *how many concurrent real players can the
gomoku-vn server (as currently written) handle at once*, and what breaks first —
CPU, memory, connection handling, or game-flow correctness — as load increases.

## 2. Method

### 2.1 Why not Playwright / real browsers

The existing e2e suite (`e2e/*.spec.ts`) drives real Chromium instances via
Playwright. Each browser context is itself a heavyweight OS process. At any
serious concurrency (hundreds+), the *test machine* running those browsers
would exhaust its own RAM/CPU long before the *server* did — the measurement
would describe Playwright's overhead, not the server's capacity.

Instead, load was generated with a plain Node.js script using raw
`socket.io-client` connections — the same wire protocol real clients use, at a
fraction of the resource cost per simulated player.

### 2.2 Bypassing the guest-auth rate limit

`POST /api/auth/guest` is rate-limited to 20 requests/15min per IP
(`server/routes/auth.js`). That makes it impossible to originate hundreds of
distinct identities from one test machine through the real endpoint. The
harness instead signed JWTs directly with `jsonwebtoken`, using the exact same
token shape and secret the server itself uses
(`{ userId, username, displayName, isGuest: true }`, `config.JWT_SECRET`,
`config.JWT_GUEST_EXPIRY}` — see `server/routes/auth.js` `signToken()`). This
is a test-only shortcut against the local server; it is not a path exposed to
real users and does not itself validate the guest-auth endpoint (that's
TEST-MATRIX rows 20/22, already covered separately).

### 2.3 Temporarily raised server caps

The server's structural room caps (`server/config.js`) are:

```
MAX_ROOMS        = 10
MAX_ROOMS_PER_IP = 3
MAX_USERS_PER_ROOM = 20   (2 players + 18 spectators)
```

That's a hard ceiling of 200 concurrent room-members, enforced regardless of
raw server headroom — a real user #201 is simply rejected. To measure how much
headroom exists *underneath* that ceiling, `MAX_ROOMS` and `MAX_ROOMS_PER_IP`
were temporarily raised (to 1200, then 5000, across the run) for the duration
of this test only, then reverted with `git checkout -- server/config.js`
immediately afterward. Confirmed clean via `git status`/`git diff` before
closing out, and the server was restarted with the real production caps
before this report was written. **The 200-member ceiling is still what ships
to real users** — this report is about the engine underneath that ceiling,
not a proposal to raise it.

### 2.4 Workload shape

Each simulated "player pair" performed a full realistic session:
connect → `room:create`/`room:join` → both `room:sit` → both `room:ready` →
wait for `game:init` → alternate 6 real, paced `game:move` emits (400ms apart,
well under the 50 events/sec flood-protection threshold) → disconnect.

Each ramp step ran its full player count **concurrently** (`Promise.all` over
all pairs for that step, not a cumulative trickle), so "players=N" means N
simultaneous connected, playing players — the actual concurrency question the
report is answering.

### 2.5 Environment

- 8 CPU cores, 14GB RAM, 11GB swap, Node v22.22.1
- Local dev server (`node server/index.js`), SQLite-backed, no reverse proxy
- Load generator: separate `node` process on the same machine (a real
  limitation of this setup — see §6)

## 3. Results

### 3.1 Main ramp (200 → 2000 concurrent players)

| Concurrent players | Concurrent games | Batch wall time | Move latency p50/p95/p99 (ms) | Errors | Server RSS |
|---:|---:|---:|---|---:|---:|
| 200  | 100 | 15.7s | 2 / 17 / 25 | 2.0% | 116MB |
| 600  | 300 | 16.2s | 1 / 7 / 16  | 2.7% | 151MB |
| 1200 | 600 | 17.2s | 1 / 23 / 52 | 7.2% | 179MB |
| 2000 | 1000 | 18.5s | 1 / 23 / 42 | 15.2% | 230MB |

Ramp was aborted at 2000 (>10% error threshold). Baseline server RSS before
the run: 89MB.

"Errors" = pairs whose game never reached `game:init` within a 15s window from
`room:ready`.

### 3.2 Follow-up: is the error tail real, or just slow?

Re-ran the 1200-player step in isolation with a 60s window instead of 15s:

| Concurrent players | Timeout window | Errors | Move latency p50/p95/p99 (ms) | Server RSS |
|---:|---:|---:|---|---:|
| 1200 | 15s (from main ramp) | 7.2% | 1 / 23 / 52 | 179MB |
| 1200 | 60s (isolated re-run) | 2.0% | 2 / 28 / 66 | 186MB |

Most of the 15s-window "failures" were not lost — they succeeded, just later
than 15s. This points to processing backlog under an artificial all-at-once
burst rather than a hard capacity wall or a stuck/broken game.

### 3.3 Follow-up: what's actually the bottleneck at 2000?

Re-ran the 2000-player step in isolation (fresh server state, 15s window)
while sampling server CPU/RSS once per second throughout:

| Concurrent players | Errors | Move latency p50/p95/p99 (ms) | Server RSS | Server CPU |
|---:|---:|---|---:|---:|
| 2000 | 2.5% | 2 / 94 / 143 | 187MB → 201MB | **9.7% → 11.9%** of one core |

CPU never exceeded ~12% of a single core. RSS growth was modest (~15MB for
1000 concurrent games). **Neither CPU nor memory was close to saturated** at
2000 concurrent players.

Note the error rate for the same nominal condition (2000 players, 15s window)
varied across runs — 15.2% mid-ramp vs. 2.5% run in isolation. This is
consistent with burst/timing variance (see §6) rather than a fixed, reproducible
failure threshold.

## 4. Findings (main ramp, §3.1-3.3)

1. **200–1200 concurrent real players (100–600 simultaneous live games) is
   comfortably handled.** Move round-trip latency stays in the low
   milliseconds at the median, RSS stays under 200MB, CPU stays in single
   digits to low teens percent of one core.
2. **The ~2-15% error tail observed at 1200-2000 is not CPU- or
   memory-driven.** Extending the acceptance window recovers most of it,
   meaning the server was still making forward progress, just queued behind a
   burst of simultaneous work — not stuck, crashed, or leaking.
3. **No crash, hang, or memory leak was observed at any tested concurrency**
   (up to 2000 simultaneous players / 1000 games). RSS growth was
   proportional and modest throughout.
4. **A precise "handles N, fails at N+1" number was not established.** The
   observed error tail is confounded by the load-generator's own
   single-process design (see §6) — it cannot be cleanly attributed to the
   *server* being at capacity from this data alone.

## 5. Addendum (2026-08-02, same day): seven targeted follow-ups

Every risk this report originally flagged as speculative (TODO.md items 19-25)
was measured directly across two follow-up sessions rather than left as an
open question.

### B25 — rejection behavior at the REAL production caps

Unlike the main ramp, this required no cap-raising at all — it specifically
tests `MAX_ROOMS_PER_IP=3` and `MAX_USERS_PER_ROOM=20` as shipped.

**Check A — `room:create` burst (15 concurrent, one IP):**

| Metric | Result |
|---|---|
| Succeeded | 3 (exactly `MAX_ROOMS_PER_IP`) |
| Rejected (clean `room:error`) | 12 |
| Silently dropped / timed out | 0 |
| Follow-up create after burst settled | still rejected (quota counter accurate) |

**Check B — `room:join` burst (40 concurrent, into one room already holding 1 member):**

| Metric | Result |
|---|---|
| Succeeded | 19 (exactly `MAX_USERS_PER_ROOM - 1`) |
| Rejected (clean `room:error`) | 21 |
| Silently dropped / timed out | 0 |

**Finding: both caps hold exactly, under real concurrent bursts, with no race
window and no silent drops.** No ghost rooms, no overflowed room membership.
This closes TODO.md item 25 with no code changes needed.

### B23 — does real auth traffic (bcrypt + synchronous SQLite) stall in-progress games?

100 concurrent real games (200 players, paced real moves every 500ms) ran
continuously while 14 concurrent **real** `POST /api/auth/register` calls
fired mid-stream (not the JWT-signing bypass used elsewhere in this report —
this specifically needed to hit `bcrypt.hash` + `better-sqlite3`'s synchronous
writes).

| Window | Move latency p50/p95/p99/max (ms) | n |
|---|---|---:|
| Before burst | 1 / 3 / 8 / 14 | 2790 |
| During burst (~921ms) | 1 / 2 / 3 / 3 | 186 |
| After burst | 1 / 2 / 4 / 5 | 2304 |

The register calls themselves were slow — p50=517ms, max=913ms for 14
concurrent — consistent with libuv's default 4-thread threadpool queueing
`bcrypt.hash` calls under contention. **But that slowness did not propagate to
in-game move latency at all.** `bcrypt.hash()` in this codebase uses the
Promise-returning async form, which runs off the main JS thread; the
synchronous SQLite calls that remain (username-uniqueness check, insert) are
fast enough on a small database to not show up in move latency at this scale.

**This overturns the report's earlier framing of item 23 as "the risk with the
clearest theoretical basis."** It had one, but it didn't manifest empirically.
Caveats that keep this from being a closed question forever: only 14
concurrent registrations (the shared 20-req/15min auth limiter capped how much
higher this could go in one run), a near-empty database, and a short ~921ms
burst window (186 samples). Worth re-checking if the real database grows large
or a much bigger registration burst becomes plausible.

### B24 (+ TEST-MATRIX row 23) — does high aggregate traffic cause flood-guard false positives?

The flood-protection middleware (`server/socket/SocketHandler.js`, `io.use(...)`,
`MAX_EVENTS_PER_SECOND=50`, `FLOOD_DISCONNECT_STREAK=5`) turned out to be
purely per-socket closure state with **no shared or per-IP counter at all** —
each connection gets its own independent 1-second bucket. Two things were
checked, and this one became a permanent test (`e2e/flood-protection.spec.ts`)
rather than a one-off scratchpad script, since it's cheap (~7-8s) and needs no
cap-raising:

| Check | Setup | Result |
|---|---|---|
| Positive (row 23) | 1 socket, ~200 events/sec (4x the cap) | Warned via `room:error`, force-disconnected after exactly 5 consecutive violating windows |
| Negative (B24) | 300 sockets, 40 events/sec each (aggregate 12 000/sec) | **0 false warnings, 0 unexpected disconnects** |
| Negative, pushed further (manual, not in the committed spec) | 500 sockets, 45 events/sec each (aggregate 22 500/sec, close to the 50/sec per-socket cap) | **Still 0 false positives** |

**Finding: the per-socket design holds under heavy aggregate load, including
close to the per-socket threshold.** The theoretical concern going in — that
`setInterval` timer jitter under heavy event-loop load could stretch a
socket's window and let its count creep past 50 even while individually
"safe" — did not materialize at any tested scale. Closes TODO.md item 24 and
TEST-MATRIX row 23 with no code changes needed.

**Honesty footnote, added later the same day:** re-running the committed spec
right after the B19-B22 session below (which tore down 784+ concurrent games
on the same long-lived server process) produced **one** failure in the
negative check (an unexpected disconnect). Restarting the server clean and
re-running 10 times in a row was 10/10 green; 4 more runs immediately after
the failure (same process, not yet restarted) were also all green. Net: 14/15
runs clean, with the single failure immediately following unrelated heavy
load on that process. Not enough to call this a confirmed bug — it didn't
reproduce on deliberate retry — but also not enough to declare fully closed.
If this spec fails again, check whether the server had just processed heavy
unrelated load before concluding it's a flaky test to retry past.

### B19 — where does the delay actually come from?

Rather than instrumenting the server (the original plan), this was answered
entirely from the client side by decomposing the handshake into segments and
running it in isolation from any move traffic.

**Pure handshake, no moves, 2000 concurrent players (1000 pairs):**

| Segment | p50 | p95 | p99 | max |
|---|---:|---:|---:|---:|
| A: `room:sit` emit → both seated confirmed | 3ms | 36ms | 38ms | 64ms |
| C: `room:ready` emit → `game:init` received | 3ms | 33ms | 38ms | 92ms |
| Total (A + C) | 6ms | 67ms | 76ms | **122ms** |

**Zero errors**, and a worst case of 122ms — nowhere near the 15s timeout that
caused failures in the original ramp. Re-running the *original* combined
script (handshake + 6 real moves) immediately after, on the same freshly
restarted server, reproduced errors again (6.7% this time) — but the failing
**stage moved**: this run's timeouts were on `room:joined` (the very first
step), where the original ramp's failures were on `game:init` (the last
step).

**Finding: the failure point is not fixed to one stage across runs, which
rules out a specific race in `room:sit` → `syncReadyWindow` → `room:ready` →
`startGame`.** A real bug in one specific handler would fail at the same
stage consistently. A moving failure point is the signature of generic
processing backlog — most plausibly the compounding effect of many pairs'
move-loops running concurrently with (and adding load on top of) other pairs
still completing setup, inside the same single-process harness (§6). Closes
TODO.md item 19 with no server code changes.

### B20 — is GC responsible for the p95/p99 tail?

Restarted the server with `--trace-gc` (a diagnostic flag, not a code change)
and reran the 2000-player scenario that previously showed a 94/143ms p95/p99
tail. Correlated the GC log against the exact wall-clock window of the burst
(computed from the server's process start time vs. the test's timestamps):

| Metric (during the 19s burst window only) | Value |
|---|---:|
| GC events in window | 66 (65 Scavenge, 1 Mark-Compact) |
| Largest single pause | 3.92ms |
| Total GC time across the whole window | 98.26ms |

Two heavier Mark-Compact pauses (10-12ms) do appear in the log, but **after**
the burst window ended — consistent with post-test cleanup GC once hundreds
of sockets/rooms were torn down, not during the latency-sensitive period.

**Finding: GC cannot explain a 94/143ms tail — the largest pause observed
during the actual load window was under 4ms.** This rules out GC as a
suspect; the tail most likely shares the same root cause identified in B19.
Closes TODO.md item 20's GC question specifically (the report's original
speculative framing is otherwise resolved by B19 + B22).

### B21 — is the per-room timer count itself expensive?

Set up 784 concurrent live games (each with its own `TimerManager` 1-second
interval, using `timerMode: 'per_move'` so the interval does real
timeout-tracking work each tick, not idle bookkeeping), then went **completely
idle** — no moves, no socket traffic of any kind — for 12 seconds, sampling
server CPU once per second throughout.

| | CPU |
|---|---:|
| Baseline, before any games started | 5.7% |
| Right after setup (784 timers now ticking) | 7.2% |
| Idle window average (12 samples) | 7.1% |
| Idle window max | 7.2% |

**Finding: 784 concurrent per-room 1-second timers cost only ~1.3-1.5
percentage points of CPU over idle baseline, and stay flat for the full
observation window.** No evidence this is expensive at this scale. Closes
TODO.md item 21 — the "merge into one shared interval" idea from the original
concern should NOT be pursued; there's no measured cost to justify touching
`TimerManager`/`state.js` (which sits directly on the live-game clock path).

### B22 — does fan-out cost scale with room size?

Compared the SAME 1000 total connections split two ways: (a) 500 rooms × 2
members (0 spectators, the shape every earlier test used) vs. (b) 50 rooms ×
20 members (2 players + 18 spectators — actually filling `MAX_USERS_PER_ROOM`).

| Scenario | Active player latency p50/p95/p99/max | Spectator latency p50/p95/p99/max | Setup errors |
|---|---|---|---:|
| (a) 500×2 | 2 / 19 / 24 / 31ms | n/a (no spectators) | 8/500 (1.6%) |
| (b) 50×20 | 1 / 70 / 122 / 125ms | 2 / 70 / 122 / 125ms | 0/50 |

Two findings, pulling in different directions:

1. **Within an already-stable room, fan-out to spectators adds essentially no
   marginal latency** — the active player and all 18 spectators receive a
   given move's broadcast at almost the same time (p50/p95/p99/max are
   nearly identical between the two columns in scenario (b)). `io.to(roomId)
   .emit()` is one synchronous call that walks the room's socket set in a
   single tick; 20 recipients doesn't meaningfully change that.
2. **But scenario (b)'s tail is much worse than (a)'s, despite having far
   fewer rooms** (50 vs 500, i.e. fewer `room:create` calls). The likely
   cause: scenario (b) has 18 spectators `room:join`-ing into each room in a
   tight concurrent burst right after creation, and **every `room:join`
   broadcasts `room:updated` to the room's entire current membership** — so
   filling one room to 20 members costs roughly 1+2+...+19 recipient-sends
   just from the join sequence itself, a quadratic-in-room-size cost
   localized to the fill phase, not steady-state play. The elevated early
   move-latency samples are plausibly an echo of this not having fully
   drained yet.

**Finding: fan-out is not a steady-state problem, but filling a room with
many simultaneous joins has a real, measurable cost concentrated in that
burst.** If this ever needs addressing, the direction is debouncing/coalescing
`room:updated` during rapid-join bursts — the same idea already applied to
`lobby:update` (TODO.md item 9) — but a real user scenario of "18 spectators
joining one room within under a second" is rare enough outside load-testing
that this isn't flagged as urgent. Closes TODO.md item 22.

## 6. Known limitations of this measurement

- **Single-process load generator.** Both the simulated 2000 players *and*
  the measurement logic ran in one Node.js process. That process is itself
  single-threaded for JS execution and was firing thousands of socket events
  in a tight burst — it is a plausible bottleneck in its own right, separate
  from the server under test. A cleaner measurement would split load
  generation across multiple OS processes (or machines).
- **Zero-paced bursts, not realistic arrival.** Every player in a ramp step
  attempted to seat and ready up within the same few milliseconds. Real
  traffic arrives smoothed over time; this setup is closer to "worst-case
  synchronized burst" than typical usage, which likely makes the 1200-2000
  numbers a pessimistic floor rather than a realistic ceiling.
- **Single Node process, single CPU core ceiling.** The application itself
  does not use clustering or worker threads — all game logic runs on one JS
  thread regardless of the 8 physical cores available. CPU usage staying at
  ~12% of *one* core at 2000 players (not 12% of all 8) means there is
  substantial same-process headroom left unused; a true ceiling test would
  need to keep pushing well past 2000 to find where a single core saturates.
- **Local loopback only.** No real network latency, no reverse proxy, no
  production `NODE_ENV` differences.
- **Short sessions.** Each simulated pair played 6 moves and disconnected,
  not a full game to completion; sustained long-lived room/state accumulation
  (e.g. hundreds of *hours-long* games in parallel) was not measured.

## 7. What this is / isn't

The main ramp and the B19-B23/B25 follow-ups in §5 were ad-hoc exploratory
measurements, not permanent automated tests — those harness scripts (plus the
one-off `--trace-gc` diagnostic run for B20) live in a session-local scratchpad
path and were not committed to the repo.
`e2e/TEST-MATRIX.md` row 35 tracks the main ramp as
`Written (exploratory, not a permanent spec)` rather than `Passing`, since
there is no fixed pass/fail assertion there — see that row's notes for the
same summary in the coverage matrix's format.

The B24 follow-up in §5 is the one exception: cheap to run (~7-8s), needs no
cap-raising, and has a clear pass/fail shape, so it became a real committed
spec — `e2e/flood-protection.spec.ts` — closing TEST-MATRIX row 23 as
`Passing` rather than staying exploratory.

## 8. Recommendations

- ~~If a hard, reproducible capacity number is needed, rebuild the load
  generator as a multi-process harness~~ **Done — see §9.**
- Consider re-running with moves paced closer to realistic human timing
  (seconds between moves, not the compressed 400ms used here) to separate
  "burst absorption" capacity from "steady-state concurrent rooms" capacity —
  these are different numbers and this report only really speaks to the
  former.
- The production `MAX_ROOMS=10` / `MAX_ROOMS_PER_IP=3` / `MAX_USERS_PER_ROOM=20`
  caps (200 total room-members) sit far below anything this test found
  concerning. If those limits are ever revisited for capacity reasons (as
  opposed to abuse-prevention reasons — see the comment above
  `MAX_ROOMS_PER_IP` in `server/config.js`), §9 now gives a verified number:
  the single-node server itself is not the constraint up to ~3000 concurrent
  players (synchronized-burst floor; real gradual arrival should do better).
- §5's seven follow-ups (TODO.md items 19-25) are all done. None surfaced a
  real code issue — item 24 became a permanent regression test
  (`e2e/flood-protection.spec.ts`, also closing TEST-MATRIX row 23); the rest
  (19-22, 23, 25) are closed as measured with no action needed. TODO.md item 26
  (permanent capacity harness) and instruction.md §A7 (multi-process re-test)
  are also now done — see §9. What's still open: instruction.md §A6
  (clustering architecture — deliberately not pursued, no measured CPU/RAM
  pressure justifies it) — §A8 (GC/heap observability) turned out to be
  answerable ad-hoc via `--trace-gc` without needing its heavier options
  (debug endpoint, APM). None of the remaining items should be acted on
  without their own dedicated measurement first (see the "tái hiện → đo →
  mới sửa" rule in `instruction.md` §B19-B26).

## 9. Follow-up (2026-08-02, later same day): verified multi-process re-test

§6/§8 flagged that the main ramp's numbers couldn't be trusted as the
*server's* limit, since the load generator itself ran single-process and was
a plausible confound. `scripts/capacity-test/` (built for TODO.md #26) is a
real multi-process harness — this section re-runs the same "how many
concurrent players" question with it, closing TODO.md #7 / instruction.md §A7.

**Setup:** throwaway server on a separate port (3099) with `MAX_ROOMS`/
`MAX_ROOMS_PER_IP` raised via env var (not editing `server/config.js` — see
§2.3 for why that pattern was needed before; the harness now does this
without touching tracked source at all), torn down after. The production
server on its normal port was untouched throughout.

**A bug in the harness itself was caught before trusting any numbers:**
`worker.js` originally ran a worker's assigned rooms **sequentially**
(`for` + `await` each room) rather than concurrently. This meant `--workers=8`
only ever produced ~8 truly-concurrent rooms regardless of `--rooms` —
exactly the kind of load-generator confound this re-test exists to eliminate.
Fixed to `Promise.all` over all of a worker's rooms; confirmed by wall-clock
time dropping in proportion (150 rooms: 100.2s sequential → 6.9s truly
parallel). The results below are all post-fix.

| Concurrent players | Concurrent games | Room success | Move latency p50/p95/p99 | Peak CPU (1 core) | Peak RSS |
|---:|---:|---:|---|---:|---:|
| 100  | 50   | 100% | 1/2/3ms    | ~4%  | ~100MB |
| 400  | 200  | 100% | 1/2/4ms    | ~4%  | ~137MB |
| 2000 | 1000 | 100% | 1/75/135ms | ~37% | ~226MB |
| 3000 | 1500 | 100% | 2/108/150ms| ~31% | ~273MB |
| 3200 | 1600 | 99.6% (6 connect timeouts) | 2/141/177ms | — | — |
| 3500 | 1750 | 87.1% | 2/122/181ms | — | — |
| 4000 | 2000 | 82.0% | 2/109/151ms | ~42% | ~271MB |

**Findings:**

1. **2000 concurrent players — the exact figure the original ramp couldn't
   validate — is confirmed clean with a genuinely multi-process load
   generator: 0 errors, p95=75ms.** The CPU figure changes materially though:
   ~37% of one core here vs. the original single-process measurement's ~12%.
   The 12% figure undersold real cost, because the load generator sharing the
   same process/core as the "measurement" was itself part of what little CPU
   time was being spent — with real concurrent OS processes generating load,
   the server's own share of one core is visibly higher, though still well
   under saturation.
2. **~3000 concurrent players is a clean, repeatable ceiling; degradation
   starts around 3200-3500.** This is the first reproducible "N is fine,
   N+1000 is not" boundary this whole investigation has produced — every
   earlier ramp point (up to 2000) was confounded, and this is the first time
   isolating the harness bug let a real edge show up.
3. **The failure mode at 3500+ is connection-handshake collision, not
   CPU/RAM.** Server logs show `Session ID unknown` — a known Engine.io
   long-polling handshake pattern when thousands of *new* connections arrive
   within the same tens-of-milliseconds window. Peak CPU at the failure point
   was only ~41-42% of one core and RSS ~271MB — nowhere near resource
   exhaustion. This reframes the bottleneck: it is specifically about the
   rate of brand-new simultaneous connections, not sustained per-connection
   load (200-3000 already-connected, actively-playing players cost very
   little).
4. **This is still an artificial synchronized-burst measurement**, same
   caveat as §6: every player in a given step attempts to connect within the
   same instant via `Promise.all`. Real traffic arriving smoothed over time
   would put far less pressure on the handshake path specifically, so ~3000
   is a pessimistic floor for "simultaneous new connections," not a ceiling
   on total concurrent players who trickle in over minutes/hours.

**What this changes vs. the original report:** the original §4 finding #4
("a precise N-fails-at-N+1 number was not established") is now superseded —
a real boundary was found (~3000 clean / ~3200+ degrading), and its root
cause (connection-burst handshake, not CPU/GC/timers/fan-out — all of which
were separately ruled out in §5's B19-B22) is identified. TODO.md #7 /
instruction.md §A7 are closed by this section.

## 10. Root cause found and fixed (2026-08-02): TCP accept-queue overflow

§9 narrowed the ceiling to "something in the connection-handshake path, not
CPU/RAM". This section identifies the specific mechanism and fixes it.

### The bug

**Node's `server.listen(port, cb)` uses a default TCP accept-queue (listen
backlog) depth of 511.** When thousands of *new* connections arrive within the
same instant, the kernel's accept queue fills, and every further SYN is
**silently dropped**. The client retries, and if the retries don't land inside
socket.io-client's connection timeout, the connection fails.

What made this hard to see: **the drop happens in the kernel, below the
application entirely.** There is no server-side log line, no `error` event, no
socket.io warning — server CPU sits at ~26-42% of one core looking perfectly
healthy while connections are being thrown away. The only visible symptom is
`connect timeout` on the *client* side, which naturally reads like a client or
network problem. (The `Session ID unknown` warnings seen in one earlier run are
a downstream symptom of the same thing: a polling handshake whose follow-up
request lands after its half-open session was already gone.)

**Confirmed by direct kernel counters,** not inference — `TcpExtListenOverflows`
in `/proc/net/netstat`:

| Run (4000 players, default transport) | Backlog | Room success | Errors | `ListenOverflows` delta |
|---|---:|---:|---:|---:|
| Before fix | 511 (Node default) | 86.1% / 88.0% | 240-282 `connect timeout` | **+14 003** |
| After fix | 4096 | **100% / 100%** | **0** | +3 118 (absorbed by SYN retry) |

Note the host's `net.core.somaxconn` was already 4096 — the kernel was willing
to queue 8x more than the application ever asked for. The bottleneck was
entirely a missing one-line argument.

### The fix

`server/index.js` now passes an explicit backlog:

```js
server.listen({ port: config.HTTP_PORT, backlog: config.LISTEN_BACKLOG }, ...)
```

with `LISTEN_BACKLOG` in `server/config.js` defaulting to **4096** and
overridable by env var. The kernel clamps the value to `net.core.somaxconn`, so
a host that allows less silently gets less rather than erroring — safe to leave
high. Regression test: `server/tests/listen-backlog.test.js` (verified to fail
if the fix is reverted, not just to pass when it's present).

**Result: 4000 concurrent connecting players now completes 100% clean with zero
errors on the stock/default transport configuration** — the exact scenario that
lost 12-14% of connections before.

### Secondary finding: transport choice (measured, NOT applied)

Independently of the backlog, forcing the client past the HTTP long-polling
handshake also fixed the 4000-player case on its own (before the backlog fix
was found):

| Transport (4000 players, backlog=511) | Room success | Errors |
|---|---:|---:|
| `['polling','websocket']` (socket.io default, what ships today) | 88.0% | 240 |
| `['websocket']` only | **100%** | **0** |
| `['websocket','polling']` + `tryAllTransports` | **100%** | **0** |

The third row is the interesting one: putting websocket first still keeps
polling as a fallback, so it gets the benefit without losing connectivity for
users behind proxies that block WebSocket (which is the entire reason
socket.io defaults to polling-first). **This has deliberately not been applied**
— the backlog fix alone already brings the default configuration to 100% at
4000 players, and changing transport order affects every real client's
connection path, so it should be its own scoped change with its own reasoning
rather than being folded in here. Logged as a candidate, not a pending fix.

### What still limits throughput above ~6000

At 6000 concurrent connecting players the backlog fix eliminates accept-queue
overflow completely (**zero** new `ListenOverflows`), but room success is still
~75% with client-side connection timeouts, at only ~26% server CPU. Doubling
the load-generator worker processes (8 → 16) did not help, so this is not
simply generator process count. This boundary is **not yet attributed** — it
could be the single-threaded engine.io handshake path, per-connection JWT
verification on the main thread, or the test machine's own ability to open
6000 sockets in a burst. Following the repo's "tái hiện → đo → mới sửa" rule,
it is recorded as unexplained rather than guessed at, and nothing has been
changed on account of it.
