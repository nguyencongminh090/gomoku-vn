# Fix log entry — 2026-08-10 12:55

## Prompt

Do #95-#102 (TODO.md), 8 findings from `/code-review` on `feature/oauth-login`
before it merged to `dev` (2026-08-10). This entry covers #98.

## Action

When `!googleClient` (missing `GOOGLE_CLIENT_ID`/`SECRET`), `GET /google` sent
a raw `503` JSON body and `GET /google/callback` sent a `503` plain-text body
— both are full-page navigations reached via `<a href>`, not fetch/AJAX
(the file's own comment says as much), yet both bypassed `login.html`'s
styled error banner that every OTHER OAuth failure (`oauth_state`,
`oauth_failed`) already uses.

Both routes now `res.redirect('/login.html?error=oauth_not_configured')`.
Added a new i18n key, `login.err_oauth_not_configured`, distinct from
`err_oauth_fail` — the existing message implies "something went wrong with
your attempt, try again," which is wrong here; this failure means the
feature isn't set up on this server, and no amount of retrying fixes it.
`client/js/login.js` now checks for this error code separately and shows the
new message.

## Decision

Followed `docs/instruction/B98-*.md`: kept the existing rationale for
redirecting-not-JSON (can't show inside AJAX) but applied it to BOTH routes
instead of just the callback. Did not change behavior for the
`googleClient` configured case, and did not add startup-time env var
detection (out of scope, see TODO.md Part A #2).

**Test coverage:** updated the two existing "not configured" tests in
`server/tests/auth-google-oauth.test.js` — they previously asserted `503`
JSON/text responses; now assert the `302` redirect to
`login.html?error=oauth_not_configured`. `npm test`: 46 suites / 1043 tests
passing.

## Summary output

- `server/routes/auth.js`: both `!googleClient` branches redirect to
  `login.html?error=oauth_not_configured`.
- `client/js/i18n.js`: new key `login.err_oauth_not_configured` (vi/en).
- `client/js/login.js`: handles `error=oauth_not_configured` with its own
  message.
- Cache-bust bumped `?v=98` → `?v=99` (verified single version).
- `server/tests/auth-google-oauth.test.js`: 2 tests updated for the new
  redirect behavior.
- `docs/todo/B98-*.md` marked done; `TODO.md` #98 line prefixed `✅` in the
  same commit.
- Branch: `fix/oauth-not-configured-ui`, off `dev` and merging back to `dev`
  (OAuth code only exists on `dev`).
