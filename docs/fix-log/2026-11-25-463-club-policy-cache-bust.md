# 2026-11-25 14:33 — #463 club.html loaded js/club-policy.js without ?v=
## Prompt
"client/club.html loads js/club-policy.js without ?v=. Find out why scripts/cache-bust.js skips it … Fix the layer that is wrong."
## Root cause
The HTML, not the script. `cache-bust.js` by design only rewrites refs that already carry `?v=<hex>`
(RE `…\?v=([0-9a-f]+)`); the tag was added bare in b1768cc6, so there was nothing to rewrite and
`js/club-policy.js` was served `immutable` with no version. Same class as #429 (renju.js).
## Fix
`client/club.html`: `js/club-policy.js?v=0` placeholder → `cache-bust.js --write` → `?v=98d4d2bc`.
Script left alone. Other bare refs found (admin-clubs.js, qrcode-generator.js, profile.css) + a
verify guard for the class → recorded as #468, not built. Branch `fix/club-policy-cache-bust` off dev.
## Verification
New `client/tests/club-scripts-versioned.test.js` (every local `<script src>` on club.html has
`?v=<8 hex>`): red on dev (club-policy.js), green after. `node scripts/cache-bust.js` OK; full `npm test` green.
