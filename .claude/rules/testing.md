---
paths:
  - "server/**"
  - "client/**"
  - "e2e/**"
---

# Fixing bugs, writing tests, calling a feature done

## Fix discipline
- **Scope = what was reported.** Speculative extra scenarios → a `TODO.md` item, not part of the fix.
- **Root cause before patch.** `docs/fix-log` repeatedly shows fixes at the *visible* layer (UI,
  timing knob, config flag) that recur from the layer below (proxy/infra, wire payload shape, build
  artifact, module resolution). Precedents: chat XSS (3 rounds → escape on the wire, decode at
  render), room/IP quota (6 rounds → `socket.handshake.address` was always `127.0.0.1` behind the
  Cloudflare Tunnel; see `getClientIp()`), stale `dist/`, `?v=N` cross-imports. If a symptom recurs, or
  the fix touches only where the value is *observed*, trace it to its origin and verify under
  production-shaped conditions (real proxy, real build output).
- Security reports: **verify each finding against current code first**; check whether a prior
  `docs/todo/*` "Ngoài phạm vi" section already ruled it out; a documented tradeoff is closed, not filed.

## Tests (both suites run under `npm test`; whole run ≈ 11 s)
- `server/tests/**` — node Jest; also pure DOM-free `client/js` modules (UMD-wrapped: `escape-utils`,
  `profanity-filter`, `timer-sync-core`). `client/tests/**` — jsdom Jest (`@jest-environment jsdom`),
  loads real module source with `readFileSync` + `window.eval` against stubbed `RoomState`/socket.
- "Client code can't be unit-tested" is **false** here. Check `client/tests/` for a suite that already
  loads your module and extend it. Only canvas pixels, real network timing and CSS layout resist both —
  say so explicitly instead of skipping silently.
- A module newly `eval`'d by a suite must be added to that suite's load order (same order as `*.html`).
- **Every fix keeps its test** — never write-run-delete. Iterate with `npx jest <file>`; run full
  `npm test` once before committing.
- Case space first: decision table for interacting conditions; valid *and* invalid transitions for
  state code; equivalence classes + boundaries (edge, ±1); basic group + edge group (null, empty,
  max-length, off-by-one, racing/near-simultaneous, disconnect mid-flow); parameterize near-twins;
  assert real output/state, not just "didn't throw".

## Feature is "done" only when
1. Backend tests (per above) **and** client: jsdom suite for the module logic **and** a real-browser
   pass from the entry point a user would use (`run` skill, or `playwright-e2e-safety`-compliant
   Playwright). jsdom stubs socket/canvas/layout, so it can't see a script that never loaded, a
   production-build wrapper, a CSP refusal or an offscreen control. (B50 shipped 806 green backend
   tests and spawned four client bugs.)
2. Every control the design calls for exists in the DOM; settings configured elsewhere carry through.
3. Flow complexity checked (`ux-audit` skill or desktop+mobile walkthrough).
4. Only then mark its `docs/todo/<CODE>` ✅ when it has a `client/` surface.
