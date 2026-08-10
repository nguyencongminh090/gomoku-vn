# Fix log entry — 2026-08-10 13:20

## Prompt

Do #95-#102 (TODO.md), 8 findings from `/code-review` on `feature/oauth-login`
before it merged to `dev` (2026-08-10). This entry covers #99.

## Action

`client/js/login.js`'s `checkExistingSession()` IIFE runs at module load and
synchronously `location.replace('index.html')`s whenever it believes there is
already a session — before the later code that reads `error=oauth_*` from the
query string and shows a banner ever runs. A user who already has a session
(guest, password, or an earlier Google login) and tries a second Google login
that fails (state mismatch, verification failure, etc.) was silently bounced
to index.html with no indication the attempt failed.

Added a check: `new URLSearchParams(window.location.search).has('error')`.
If present, `checkExistingSession()` skips its redirect, letting the
error-banner code run and render. No `error=` param (by far the common case):
unchanged, still auto-redirects.

## Decision

Followed `docs/instruction/B99-*.md`: changed only the ORDER of the check in
`login.js`, not `hasBelievedSession()`/session-reading logic itself, and left
the no-error, no-existing-session common case fully unchanged.

**Test coverage:** `client/js/` has no test runner wired to `npm test` for
most files — followed the jest-environment-jsdom pattern already established
by `client/tests/tournament-match-leave-lock.test.js` (real page markup as
DOM fixture) and added `client/tests/login-oauth-error-banner.test.js`, 5
cases covering the decision table (existing session × error param, both
axes) including the two failure modes this fix targets. `npm test`: 47
suites / 1048 tests passing.

## Summary output

- `client/js/login.js`: `checkExistingSession()` skips its redirect when
  `error=` is present in the query string.
- New test: `client/tests/login-oauth-error-banner.test.js` (5 cases).
- Cache-bust bumped `?v=99` → `?v=100` (verified single version).
- `docs/todo/B99-*.md` marked done; `TODO.md` #99 line prefixed `✅` in the
  same commit.
- Branch: `fix/login-oauth-error-banner`, off `dev` and merging back to
  `dev` (OAuth code only exists on `dev`).
