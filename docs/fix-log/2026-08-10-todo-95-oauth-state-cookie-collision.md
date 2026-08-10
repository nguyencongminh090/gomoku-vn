# Fix log entry — 2026-08-10 11:31

## Prompt

Do #95-#102 (TODO.md), 8 findings from `/code-review` (8 agents) on
`feature/oauth-login` before it merged to `dev` — user asked "Review OAuth
feature safe to merge to dev" (2026-08-10). This entry covers #95.

## Action

`GET /api/auth/google` and `GET /api/auth/google/callback`
(`server/routes/auth.js`) used a single fixed cookie name (`gvn_oauth_state`)
to carry the CSRF `state` value between the two requests. Two `/google`
requests from the same browser close together (2 tabs, or a slow
double-click) both wrote to that same cookie name — the second overwrote the
first's value. When the first flow's callback then ran, it read the SECOND
flow's state, found a mismatch, redirected `error=oauth_state`, and cleared
the cookie the second flow still needed — breaking both attempts.

Changed the cookie name to embed the state value itself:
`gvn_oauth_state_<state>`. `GET /google` now sets a cookie named after its
own random state; `GET /google/callback` derives the cookie name to look up
from the query string's `state` value and checks for its *existence* (rather
than comparing two separately-read values). Concurrent flows from the same
browser now write disjoint cookies — no shared slot to collide over — while
keeping the same CSRF property: the callback only succeeds if a cookie named
after that exact state value is present, i.e. this browser really received
it from `/google`.

Added `OAUTH_STATE_RE` (`/^[a-f0-9]{32}$/`, matching what
`crypto.randomBytes(16).toString('hex')` produces) to validate the
query-string `state` BEFORE using it to build a cookie name to look up — an
attacker-controlled value must never flow unvalidated into a cookie-name
lookup.

## Decision

Followed `docs/instruction/B95-*.md`'s recommended direction (embed state in
something disambiguating rather than redesigning the cookie mechanism) and
its explicit caution to not weaken CSRF protection while fixing the UX bug —
verified via a new regression test that simulates the exact reported
scenario (2 back-to-back `/google` requests, then both callbacks, in that
order) and confirms both succeed. Did not touch the session cookie mechanism
or the OAuth redirect_uri/PKCE flow, per the instruction's "Phạm vi KHÔNG
làm".

**Test coverage:** updated `server/tests/auth-google-oauth.test.js` for the
new cookie-name scheme (existing tests use a per-test `RIGHT_STATE` constant
and a `rightStateCookie()` helper instead of the old fixed name), added one
new test for the malformed-state-query-param case (never used to build a
cookie name), and one new test reproducing the exact concurrent-tabs
scenario from the report. `npm test`: 46 suites / 1037 tests passing.

## Summary output

- `server/routes/auth.js`: `OAUTH_STATE_COOKIE` (fixed name) replaced by
  `OAUTH_STATE_COOKIE_PREFIX` + `oauthStateCookieName(state)`; added
  `OAUTH_STATE_RE` validation on the incoming `state` query param before any
  cookie-name lookup.
- `server/tests/auth-google-oauth.test.js`: updated for the new cookie
  naming, +2 new tests (malformed state, concurrent-tabs regression).
- `docs/todo/B95-*.md` marked done; `TODO.md` #95 line prefixed `✅` in the
  same commit.
- Branch: `fix/oauth-state-cookie-collision`, off `dev` and merging back to
  `dev` — the OAuth code this fixes only exists on `dev` (not yet merged to
  `main`).
