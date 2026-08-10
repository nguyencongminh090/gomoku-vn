# Fix log entry — 2026-08-10 11:54

## Prompt

Do #95-#102 (TODO.md), 8 findings from `/code-review` on `feature/oauth-login`
before it merged to `dev` (2026-08-10). This entry covers #102 (parts 1 and
2 only — see Decision).

## Action

**Part 1.** `client/js/login.js`'s `onAuthSuccess(data)` and
`client/js/oauth-complete.js`'s success branch each hand-wrote the same
"cache the profile via `GvnSession.setUser()`, then
`location.replace('index.html')`" sequence, with slightly different
parameter shapes (`{user}` vs bare `user`). Added
`GvnSession.completeLogin(user)` to `client/js/session.js` — both call sites
now call it instead of duplicating the two lines.

**Part 2.** `server/routes/auth.js`'s `GET /google/callback` new-account
branch called `db.getUserById(userId)` immediately after `db.createUser()`,
re-reading a row whose every field was already known in scope (unlike the
race-loser branch just below it, which genuinely needs to re-read since it
lost the race and its own scope values never landed in the DB). Replaced the
re-read with a plain object built from the fields already in scope.

## Decision

Followed `docs/instruction/B102-*.md`: normalized the parameter shape to a
bare `user` (matching what `completeLogin` needs) when gathering both call
sites under it. Left the race-loser branch's `getUserByOAuthId()` re-read
untouched — that one is a real requirement, not redundant.

**Skipped Part 3** (dropping `oauth-complete.html`, redirecting straight to
`/index.html#<payload>` with fragment parsing added to `index-entry.js`) —
per the instruction's own "Phạm vi KHÔNG làm": explicitly not required
alongside parts 1/2, carries more risk (touches `index-entry.js`'s module
init order) for a benefit (one fewer page load) judged not worth it right
now. Left as a possible future follow-up, not filed as a new TODO item since
the instruction already documents it.

**Test coverage:** new `client/tests/session-complete-login.test.js` (2
cases: caches + redirects; falsy user still redirects without touching the
cache, matching the old `onAuthSuccess` guard). New test in
`server/tests/auth-google-oauth.test.js` asserting `db.getUserById` is never
called on the new-account path. `npm test`: 48 suites / 1053 tests passing.

## Summary output

- `client/js/session.js`: added `GvnSession.completeLogin(user)`.
- `client/js/login.js`: `onAuthSuccess()` now delegates to it.
- `client/js/oauth-complete.js`: success branch now delegates to it.
- `server/routes/auth.js`: new-account branch builds `user` from scope
  instead of re-reading it.
- New test: `client/tests/session-complete-login.test.js` (2 cases).
- `server/tests/auth-google-oauth.test.js`: +1 test.
- Cache-bust bumped `?v=100` → `?v=101` (verified single version).
- `docs/todo/B102-*.md` marked done (parts 1+2; part 3 explicitly not done);
  `TODO.md` #102 line prefixed `✅` in the same commit.
- Branch: `fix/oauth-client-duplication`, off `dev` and merging back to
  `dev` (OAuth code only exists on `dev`).
