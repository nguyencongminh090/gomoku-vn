# Fix log entry — 2026-08-08 09:43

## Prompt

"Do #66" — TODO.md #66 / instruction.md B66: `POST /api/auth/{login,register,guest}`
return a fresh JWT in the response body but set no `Cache-Control` header, so
a misconfigured intermediary proxy or the browser bfcache could retain a
response containing a token.

## Action

- Added one small middleware in `server/routes/auth.js`, right after
  `authLimiter`: `router.use((req, res, next) => { res.set('Cache-Control',
  'no-store'); next(); })`. Applies to all three routes on both success and
  error branches, since it runs before any handler sets a response.
- Did not touch Helmet's global config and did not extend `no-store` to
  `server/routes/games.js` — per `instruction.md` B66, `GET /api/games*`
  serves public, non-sensitive data and may still benefit from caching.
- New test file `server/tests/auth-cache-control.test.js`, following the same
  in-process-server + `fetch` pattern as `auth-error-codes.test.js`: asserts
  `cache-control: no-store` on real responses for register success, register
  error (400), login success, login error (401), and guest.

## Decision

Branched `fix/auth-cache-control-no-store` off **`dev`**, not `main`: TODO.md
#66 and its `docs/todo/`/`docs/instruction/` detail files were only ever
triaged onto `dev` (main's `TODO.md` stops at #50, well before the network
security audit that produced #62-#67), even though the underlying bug in
`server/routes/auth.js` is identical on both branches. Branching off `main`
would have implemented the fix correctly but left the tracking docs
(TODO.md/instruction.md index lines, `docs/todo/B66-*.md` status) unreachable
there, since `main` doesn't have the entries to mark done. Same reasoning as
the `fix/csp-third-party-script` precedent: match the branch to where the
task's tracking context actually lives. `main` has the same underlying bug
and needs this same fix whenever `dev` is next merged into `main`.

## Summary output

- `npm test`: 855/855 passed (850 existing + 5 new in
  `server/tests/auth-cache-control.test.js`).
- Branch: `fix/auth-cache-control-no-store` off `dev`, merged back to `dev`.
