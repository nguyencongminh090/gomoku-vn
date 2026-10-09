# Fix log entry — 2026-08-28 16:05

## Prompt

"Do 168" → "continue step 2-4" → "continue Step 5" → "Continue Step 6-8".
TODO.md #168 / `docs/instruction/B168-*.md`: build the unlisted `/diag`
diagnostic latency page so the high-latency reporters behind #155 (China) and
#165 (USA+VPN) can self-measure without playing a ranked game, then submit
results to feed #167 Step 1. Not a survey task — every open question was
resolved in `features/diagnostic-latency-page/`. Eight sequential steps, one
commit each, `npm test` green between steps.

This fix-log entry exists mainly to **record the client-side test gap**, which
`docs/instruction/B168-*.md` step 8 explicitly requires.

## Action

Eight commits on `feature/diag-latency-page` (off `dev`):

1. **`client/js/timer-sync-core.js`** — verbatim extraction of the room's
   half-RTT EMA + transit-delay display shave + clock-offset maths out of
   `room-socket.js` `tickLocal`/`applyTimerSync` and `game-ui.js`
   `recordMoveRtt`. Both room files now `import` it; loaded as a classic
   `<script>` in `room.html` (not an entry module — Vite's commonjs plugin
   would lazily wrap the UMD file and leave `window.TimerSyncCore` unset in a
   production build, the #65 trap). One deliberate divergence, documented in
   the file header: the old offset read `Date.now()` twice
   (`(sync.serverTime || Date.now()) - Date.now()`), so the no-`serverTime`
   fallback could yield -1ms of phantom skew; the core takes one reading.
   +43 tests incl. a room-parity block re-running the pre-#168 expressions
   token-for-token, + `timer-sync-conformance.test.js` (both room files call
   the core, no re-inlined copy of the 8s clamp / 30s ceiling / 50/50 blend).
   The three jsdom suites that exercise `tickLocal`/`recordMoveRtt` each
   `eval` the core first now, mirroring `room.html`'s load order.
2. **`server/socket/diag-namespace.js` + `server/utils/diag-results.js`** —
   `io.of('/diag')`, mounted after `io.use(verifySocketToken)` and unaffected
   by it (io.use binds to the main namespace only). No `nsp.use()` at all: a
   guard hidden in middleware would be bypassed by
   `connectionStateRecovery`'s `skipMiddlewares` if ever enabled (#147).
   Never reads `socket.user`, never touches RoomManager/state.js/SessionMgr.
   `RunLimiter`: 5 runs/IP/hour, sliding window, charged at **start** not
   submit. `diag:ping` echoes seq/clientTs untouched + a monotonic hrtime
   reading as a **string** (ns exceed `Number.MAX_SAFE_INTEGER`). `diag:submit`
   8 KB cap measured in **bytes**. `diag-results.js`: JSONL is the source of
   truth (OQ4); control chars replaced before `JSON.stringify` (a raw newline
   splits a record across physical lines); non-finite numbers dropped not
   coerced; every field whitelisted; ip/geo/ua server-derived; 90-day prune
   on write, aged by the **date in the filename** not mtime. +95 tests.
3. **`server/socket/diag-session.js`** — real `GameEngine` + real
   `TimerManager` per run; instant random bot picking legal moves via
   `engine.makeMove` (not a hand-rolled check). Plain board (walls off —
   `_validateSettings({})` default, and the only setting where every click is
   a legal move rather than a first-move-zone refusal). `per_game` mode
   (OQ2), but `DIAG_TIMER_SECONDS=300` not the app's 60 — a ~60s run against a
   60s budget would time out mid-measurement. `spentMs` from
   `process.hrtime.bigint` marks, returned in the move ack so it reaches the
   JSONL (it was previously logged only). `endRun()` is the single teardown
   path — a `DiagSession` dropped without `destroy()` leaks a 1s interval.
   +45 tests.
4. **`client/js/diag/latency-probe-session.js` + `diag-probe-session.js`** —
   abstract base owns the sample loop, nearest-rank percentiles (never
   interpolated — every reported number is one the network produced),
   consecutive-sample jitter, least-squares drift/min, sequence-gap loss
   (only seqs below the highest echoed count as lost). Rolling half-RTT via
   `TimerSyncCore.halfRttEma` — the room's own EMA. Concrete subclass is the
   `diag:ping`/`diag:pong` binding only. +73 tests incl. a parity block
   asserting the estimate equals the room's sample-for-sample.
5. **`client/diagnostic.html` + `css/diag.css` + `diag/{diag-report,diag-board,
   diag-entry}.js`** — Zen Minimal, four screens (intro/running/results/sent),
   VN+EN (60 i18n keys each). Thresholds **derived**, not picked: 500ms
   half-RTT (red) = half the room's 1000ms tick; 250ms (yellow) = the ~500ms
   RTT recorded for the affected players in `game-ui.js`'s
   `MOVE_ACK_TIMEOUT_MS` comment. Board composes the real `BoardRenderer` +
   optimistic overlay (R4 + board lock), `clickMode: 'single'`. Partial runs
   submittable and labelled; raw figures in a collapsed `<details>`. +64
   tests incl. the decision table with boundaries at exactly t1/t2,
   `diag-sprite-icons.test.js`, `diag-i18n-coverage.test.js`.
6. **`.claude/rules/diagnostic-page-sync.md`** — path-scoped, names the three
   couplings that drift silently between the diagnostic path and the room
   path. Added to CLAUDE.md's rules index.
7. **`docs/todo/B167-*.md` + `docs/instruction/B167-*.md` + both index lines**
   — B168 recorded as the built Step-1 sample channel; the Step-2 safety spec
   (server is the only timeout authority, `clientTs` cross-check only)
   restated as unchanged. Tasks not merged.
8. **Isolated e2e verification** (port 3199, throwaway DB) — below.

Stacked, not done here: **B169** (`tournament-match.js`'s own clock copy —
inside B168's documented "Ngoài phạm vi", carries the same `Date.now()`
double-read defect).

Also fixed along the way, both invisible until a production build:
`vite.config.js`'s classic-script copier used `cpSync` without creating parent
dirs (`js/diag/` would throw); `diagnostic.html` was not in
`rollupOptions.input`. And CLAUDE.md's cache-bust grep was `client/js/*.js`,
which does not descend into `client/js/diag/`.

## Decision

- **`?v=166 → 168`** across the whole repo (167 was an intermediate bump at
  step 1). Grep shows exactly one value.
- **Client-side test gap (the point of this entry):** the pure modules are
  fully covered in the Node-environment suite — `timer-sync-core`,
  `latency-probe-session`, `diag-probe-session`, `diag-report` — plus
  `diag-i18n-coverage` and `diag-sprite-icons` in jsdom. **Not** covered by
  any automated test: `client/js/diag/diag-entry.js` (the 4-screen DOM state
  machine + socket lifecycle) and `client/js/diag/diag-board.js` (the
  `BoardRenderer` composition — needs a real canvas). Both are verified only
  by the live Playwright walkthrough at desktop + mobile. This is narrower
  than "client has no tests" but it is a real gap: a regression in
  `diag-entry.js`'s screen transitions or `diag-board.js`'s
  optimistic-then-emit ordering would pass `npm test`. The live walkthrough
  is the current guard; a jsdom harness for `diag-entry.js` (stub socket, like
  the room suites) is the obvious follow-up if the page gets more logic.
- Two bugs the browser found that no unit test could: `diag-board.js`
  referenced `root` inside its UMD factory (out of scope — "root is not
  defined", browser only); five sprite ids did not exist incl. all three
  verdict icons (a `<use>` at a missing symbol renders nothing, silently —
  B129's doc names this exact failure). `diag-sprite-icons.test.js` now makes
  that permanent.
- B168 marked ✅ ĐÃ XONG: both layers verified (client live in step 5, backend
  isolated in step 8). Lives on `feature/diag-latency-page`, pending merge to
  `dev` per git-workflow.

## Summary output

`feature/diag-latency-page` off `dev`, 8 commits. `npm test` **1831/1831**
(88 suites, +320 over the pre-#168 1510).

Isolated e2e (port 3199, throwaway DB — real DB md5 `d1d9a336…` matched
before *and* after, 25 users / 334 games / integrity ok unchanged; a
pre-existing `server/index.js` on port 3000 that this session did not start
held the real DB open throughout — its file was renamed out from under it
twice by the DB-aside step and it kept working via open fds, but that was
fortunate rather than by design; noting it so the next `/diag` e2e uses a
`DB_PATH` override if one gets added, or checks for a foreign server first):

- Full ~60s browser run → reached "complete" (partial banner hidden) → submit
  → **exactly 1 JSONL line + exactly 1 `[DiagResult]` log line**. Every
  documented `run` field present incl. `spentFloorMs`; `ip`/`geo`
  server-derived; feedback newline collapsed to one line. 11 `[DiagResult
  move]` lines; 6 diag runs started = 6 ended (no leaked `TimerManager`).
- **6th run from an IP at the cap → `DIAG_RATE_LIMITED`** with `retryAfterMs`.
- **Main namespace unaffected:** a real guest→create→sit→start→move flow
  still starts a game, `room.html` still loads `timer-sync-core` (clamp
  8000), the room clock counted down 4s in 3.5s, zero page errors.

Client-side test gap recorded above: `diag-entry.js` + `diag-board.js` have
no automated test, live-Playwright only.
