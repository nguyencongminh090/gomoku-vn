---
name: engineering-method-lessons
description: Cross-cutting process rules from the gomoku-vn fix-log - measure first, fix the producing layer, verify on production-shaped conditions, keep tests and log honest
domain: gomoku-vn
tags: debugging,process,root-cause,verification,testing,git-merge
apply_when: "before starting any bug fix, perf/infra change, or merge into dev/main in gomoku-vn, and before trusting an instruction.md quick-fix"
sources: "2026-08-12-todo-112-csp-cloudflare-insights, 2026-08-12-xac-minh-112-end-to-end-sau-restart, 2026-08-12-todo-111-socket-io-client-cache-control, 2026-08-22-todo-146-touchsession-do-dong, 2026-08-22-todo-147-connectionstaterecovery-dieu-tra-dong, 2026-08-29-todo-170-ready-deadline-server-clock, 2026-08-14-todo-118-mobile-board-resize-dvh, 2026-08-21-todo-133-vong-2-truc-ngang-tran-vien, 2026-08-21-todo-133-vong-4-quen-bump-v-sau-merge, 2026-08-22-todo-142-grid-track-day-rail-ra-khoi-drawer, 2026-08-02-correction-to-the-fix-logged-at-2026-08, 2026-08-02-backend-todo-phan-b-11-verification-report-on, 2026-08-27-todo-157-merge-into-dev-rebump, 2026-08-21-todo-135-svg-icon-orphaned-selectors; TODO #11 #104 #111 #112 #118 #133 #135 #139 #142 #146 #147 #149 #157 #170"
last_reviewed: 2026-10-09
confidence: high
---
# Engineering method lessons

## Why this note exists
Several fixes took 2-6 rounds because the first attempt patched the visible layer, trusted a guess, or was never proven. Each rule below cost at least one wasted round.

## Facts and rules
1. **Measure, do not guess.** Download and grep the artifact, run a probe, read `node_modules`. #112: grepping `beacon.min.js` showed it loads from `static.cloudflareinsights.com` but reports to a different host, so allowlisting only the script host would have fixed nothing.
2. **Test the instruction's own premise before coding.** #111: both approaches in `instruction.md` were impossible (engine.io swallows `/socket.io/*`; Cache-Control is hardcoded); a probe refuted them. Serve from `/vendor/socket.io` instead and record the deviation.
3. **A quick-fix in `instruction.md` can be a no-op.** #170: swapping `Date.now()` for `serverNow()` did nothing because `clockOffsetMs` is only set by `timer:sync`, which does not exist before a game. Fix: stamp `serverTime` in `serializeRoom()`. Trace where the value is produced.
4. **Fix the layer that produces the value.** #142: four rounds inspected borders; the bug was `1fr` (= `minmax(auto,1fr)`) in the grid track. Switch layers when a symptom survives one fix.
5. **Reproduce with realistic data.** #142: guest names were short, so the overflow never appeared. Use long names, real devices, real proxy.
6. **Real device or real proxy beats emulation.** #118 (iOS `100vh`) was applied defensively because Chromium emulation cannot reproduce it; the entry says "unverified on device" and TODO #118 carries the caveat. State the gap, never claim "fixed".
7. **Measure before fixing perf worries; close as tradeoff when the number says so.** #146: isolated `touchSession()` cost is microseconds, so close with no code change. The unreachable 5 s `SQLITE_BUSY` finding was filed separately (#149), not folded in.
8. **Investigation can end "no change".** #147: reading socket.io source showed `connectionStateRecovery` is safe only with `skipMiddlewares: false` and gains almost nothing, since reconnect already re-sends full state.
9. **A fix can introduce a regression; log a correction.** 2026-08-02: the restart-hang fix destroyed rooms on every first connect. Fix: gate on `handshake.auth.reconnect`. The old entry stays; the correction is a new entry (fix-log is append-only).
10. **A shipped fix needs a test that fails without it.** #11: six shipped fixes stayed green when removed. Prove each test by reverting the fix (mutation check); one test was narrowed because it could not detect the revert.
11. **Audit all consumers of a migrated contract.** #135: icon markup moved from `<i>` to `<svg class="icon">`, CSS selectors targeting `i` were missed. Grep CSS and JS, not just markup.
12. **Do not claim the reporter's symptom is solved when the evidence does not match.** #135: measured 13px vs 15px could not explain the reported "zoom"; the entry says so.
13. **Merges: `?v=N` becomes `max(dev, main) + 1`, repo-wide.** #133 round 4 kept 133 after merge and shipped stale JS; #157 repeated the rule on `dev` (155 to 156).
14. **Use real taps in verification.** #139: `page.click()` hit-tests; `el.click()` via `evaluate` gives false passes.

## Symptom -> real cause -> fix
| Symptom | Real cause | Fix |
|---|---|---|
| CSP still blocks analytics | data host differs from script host | allowlist both (#112) |
| ready countdown wrong on skewed clock | no server time before first `timer:sync` | `serverTime` in payload (#170) |
| live site shows old board after merge | `?v=` not re-bumped | max+1 (#133) |

## Verify before calling it fixed
- `grep -rn "?v=" client/*.html client/js/ | grep -v mockup | grep -o "?v=[0-9]*" | sort -u` shows one value.
- Revert the fix in a scratch copy; the new test must go red.
- Check on the production domain or an isolated server on another port, never the real DB.

## Do not use when
Pure doc edits, or work with no failing behaviour to diagnose.

## Related
`mobile-layout-zen-ui.md`, `i18n-and-server-message-codes.md`, `be-realtime.md`; `.claude/skills/git-workflow`; TODO #11 #112 #133 #170.
