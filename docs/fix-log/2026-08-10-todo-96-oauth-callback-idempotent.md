# Fix log entry — 2026-08-10 11:52

## Prompt

Do #95-#102 (TODO.md), 8 findings from `/code-review` on `feature/oauth-login`
before it merged to `dev` (2026-08-10). This entry covers #96.

## Action

`GET /api/auth/google/callback` used a Google authorization `code` — single
use by design. If the same callback request is delivered twice (a
network-level retry, or a browser Back/Forward replay), the second request
reads the same state cookie the first already consumed and cleared (or, after
#95, the first already cleared its own per-flow cookie) and falls into the
missing-state-cookie branch — indistinguishable, before this fix, from a
genuine CSRF/expired-state failure — and redirects `error=oauth_state`, even
though the first request already started a valid session.

Added a check inside that branch: if `code`/`state` are otherwise well-formed
and the request already carries a valid session cookie
(`readSessionIdFromHeader()` + `sessionManager.getValidSession()`), treat this
as a duplicate of an already-completed flow and redirect to `/index.html`
instead of an error page. Without a valid existing session, behavior is
unchanged — still `error=oauth_state`.

## Decision

Followed `docs/instruction/B96-*.md`: did not touch `googleClient.getToken()`
or try to eliminate the underlying HTTP race (not realistic), only handle it
correctly when detected via an existing valid session — the signal the
instruction suggested. Kept the check narrow (only fires when `code`+`state`
are already valid) so it cannot mask a genuine CSRF failure that happens to
arrive from a browser holding some unrelated pre-existing session.

**Test coverage:** two new tests in
`server/tests/auth-google-oauth.test.js` — no state cookie + no valid session
still errors as before (guards against silently swallowing real failures),
and no state cookie + a valid session redirects to `/index.html` without
calling `getToken`/`createSession`. `npm test`: 46 suites / 1039 tests
passing.

## Summary output

- `server/routes/auth.js`: `GET /google/callback`'s missing-state-cookie
  branch now checks for an existing valid session before concluding
  `error=oauth_state`.
- `server/tests/auth-google-oauth.test.js`: +2 tests.
- `docs/todo/B96-*.md` marked done; `TODO.md` #96 line prefixed `✅` in the
  same commit.
- Branch: `fix/oauth-callback-idempotent`, off `dev` and merging back to
  `dev` (OAuth code only exists on `dev`).
