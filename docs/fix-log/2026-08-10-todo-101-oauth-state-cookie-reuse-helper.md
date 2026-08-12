# Fix log entry — 2026-08-10 12:15

## Prompt

Do #95-#102 (TODO.md), 8 findings from `/code-review` on `feature/oauth-login`
before it merged to `dev` (2026-08-10). This entry covers #101.

## Action

The OAuth state cookie (`server/routes/auth.js`) set its `httpOnly`/
`sameSite`/`secure`/`path` by hand instead of reusing
`session-cookie.js`'s `baseCookieOptions(req)`, which exists specifically so
set and clear paths for a cookie can never drift out of sync (its own header
comment says so). The clear call was especially exposed: it only passed
`path`, omitting the other three attributes `clearSessionCookie()` always
includes.

`baseCookieOptions(req, path = '/')` now takes an optional `path` override.
`auth.js`'s state-cookie set and clear both call
`baseCookieOptions(req, OAUTH_STATE_COOKIE_PATH)` — one source of truth for
both, matching how `session-cookie.js` already treats the session cookie's
own set/clear pair. No cookie attribute's actual value changed.

While wiring this up: `baseCookieOptions` had never been in
`session-cookie.js`'s `module.exports` — it was only ever used inside that
file. Added it to the export list so `auth.js` can import it; without this
the destructured import silently resolves to `undefined` and calling it
throws inside the request handler (caught while running the updated tests —
see below).

## Decision

Followed `docs/instruction/B101-*.md` exactly: minimal parameter addition,
no change to `sameSite`/`httpOnly`/`secure` values, `maxAge` kept separate
per-call since state and session cookies have different TTLs by design.

**Test coverage:** no new tests needed — `server/tests/auth-google-oauth.test.js`
(from #95/#96) already exercises both the set (`Set-Cookie` attribute
assertions) and clear paths of the state cookie; all pass unchanged after
switching to the shared helper, confirming no attribute values shifted.
`npm test`: 46 suites / 1039 tests passing.

## Summary output

- `server/utils/session-cookie.js`: `baseCookieOptions(req, path = '/')` now
  takes an optional path; exported (previously internal-only).
- `server/routes/auth.js`: state cookie set/clear both call
  `baseCookieOptions(req, OAUTH_STATE_COOKIE_PATH)` instead of hand-written
  flags.
- `docs/todo/B101-*.md` marked done; `TODO.md` #101 line prefixed `✅` in the
  same commit.
- Branch: `fix/oauth-state-cookie-reuse-helper`, off `dev` and merging back
  to `dev` (OAuth code only exists on `dev`).
