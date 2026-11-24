# 2026-11-25 — #452 Phone tab "Tôi" placeholder `href="#"` opened the lobby under `<base href="/">`
## Prompt
"do #452" — member's tab bar "Tôi" starts as `href="#"` until `/me` answers; on `<base href="/">` pages that is `/#` (lobby).
## Root cause
`platform-shell.js` `build()` set `a.href = '#'` as a placeholder. A relative `#` resolves against the document
base URL, so on club/social/profile/settings/forum/… a tap before `/me` returned (or after it failed) went to `/`.
Same class as #281 / #451.
## Fix
- `client/js/platform-shell.js`: member "Tôi" tab built with no `href` + `aria-disabled="true"` (inert, still the
  same `<a data-tab="me">` with icon + label); the `/me` handler sets `/u/<name>` and drops `aria-disabled`.
  `/me` failure leaves it inert. Desktop chip's profile link untouched (todo Don't).
- Branched off `main` (bug exists there). On `dev`, `swipeTarget()` already treats a missing `href` as "no target".
## Verification
- `client/tests/platform-shell.test.js`: new #452 test with `<base href="/">` in head (in-flight `/me` → no href,
  aria-disabled; answered → `/u/zed`; failed → stays inert); red on old code, green after. Existing member test updated.
- cache-bust OK. `npm test` 4410/4410.
- Real browser (headless Chromium 390×844 touch, real server on a throwaway `GOMOKU_DB_PATH`, `/api/shell` +
  `/api/rankings/me` intercepted) on `/rankings.html`: old `main` shell → tap "Tôi" while `/me` in flight lands on
  `/#`; new → stays on rankings, then `/u/zed` after `/me` answers; `/me` 500 → tap stays on rankings.
