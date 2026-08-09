# Fix log entry — 2026-08-09 12:38

## Prompt

Do #88 (TODO.md #88 / instruction.md B88): guest/audience viewing a tournament
match room cannot escape — the backend-driven "leave locked" state meant for
the two active players was also being applied to spectators/guests.

## Action

`client/js/tournament-match.js` — gated all three `setLeaveLocked(true)`
call sites on `myPlayer()` (the existing helper that already distinguishes a
real player from a spectator, including guest spectators, by matching
`userInfo.userId` against `gameState.players`):

- Removed the unconditional `setLeaveLocked(true)` at module load (old line
  71). At that point `gameState` is still `null` (`tmatch:init` hasn't
  arrived yet), so `myPlayer()` would always read `null` there regardless of
  the real viewer — there was no correct way to gate this call site, so it's
  gone. The link now starts enabled by default (matches its plain HTML with
  no `detail-back--disabled` class), until the `tmatch:init` handler below
  makes the first real decision.
- `tmatch:init` handler: `setLeaveLocked(true)` → `setLeaveLocked(!!mp)`,
  reusing the `mp = myPlayer()` already computed on the line above.
- `showSeriesTransition()`: `setLeaveLocked(true)` → `setLeaveLocked(!!mp)`,
  reusing the `mp = myPlayer()` already computed earlier in the same
  function (also already used there to branch the ready-button vs.
  waiting-state UI for players vs. spectators).
- `showResultOverlay()`'s `setLeaveLocked(false)` (the unlock on pairing
  decided) was left unconditional — applying "unlocked" to a spectator who
  was never locked is a no-op, so no gating needed there.

Bumped the shared cache-busting version `?v=94` → `?v=95` across every
`client/*.html` and `client/js/*.js` occurrence (per CLAUDE.md's cache-bust
rule), since `tournament-match.js` changed.

## Decision

Scope kept to exactly the reported bug: the lock now only ever applies to
the two real players, matching the mechanism's original stated intent
("Prevents a player from wandering off mid-series", comment already in the
file) — no change to *when* players themselves get locked/unlocked, no
change to the server (confirmed via CodeGraph + grep that there is no
server-side or `beforeunload`-based navigation lock anywhere else — this was
purely a client-side link-disable bug), and no new lock mechanism added for
either role.

**Test coverage:** `client/js/` has no unit test infrastructure (no runner
wired to `npm test`), consistent with every other client-only fix in this
log — no permanent test was added for this change. Verification was by
direct code inspection: the new gate reuses the exact `mp`/`myPlayer()`
pattern already relied on elsewhere in the same file for the equivalent
player-vs-spectator distinction (`showResultOverlay`'s win/loss/spectator
title branch, `showSeriesTransition`'s ready-button-vs-waiting-state
branch) — both already function correctly in production, giving confidence
the reused boolean is reliable here too. No live browser/Playwright
walkthrough was run for this fix; flagging that explicitly rather than
silently skipping it.

## Summary output

- `client/js/tournament-match.js`: `setLeaveLocked` now only ever locked for
  actual players (`myPlayer()` truthy); load-time unconditional lock removed
  entirely, deferred to the first `tmatch:init`.
- Cache-bust version bumped `?v=94` → `?v=95` (verified via
  `grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` — exactly
  one version across all matches).
- `npm test`: 40 suites / 970 tests passing (no regressions — change is
  client-only, doesn't touch any server file).
- Branch: `fix/tournament-match-spectator-leave-lock`, off `dev` (the buggy
  file, `client/js/tournament-match.js`, and TODO.md #88's tracking entry
  both exist only on `dev` — `main` doesn't have this file at all yet, per
  the git workflow's dev-only exception).
