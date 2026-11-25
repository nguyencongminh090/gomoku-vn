# B468 — Bare local script/style refs escape cache-bust (recurring class)
**Status:** ✅ FIXED 2026-11-25 — verify guard + 3 refs versioned (fix-log 2026-11-25-468)
**Area:** scripts/cache-bust.js (verify), client/admin.html, client/room.html, client/profile.html
**From:** found while fixing #463, 2026-11-25   **Depends:** B463

## Problem
`cache-bust.js` only rewrites refs that already carry `?v=<hex>`; nothing flags a bare ref.
Same class hit #429 (renju.js) and #463 (club-policy.js). Still bare on dev fc980764:
`admin.html` `js/admin-clubs.js`, `room.html` `js/qrcode-generator.js`, `profile.html` `css/profile.css`.

## Scope
1. Version those three refs (`?v=0` + `--write`).
2. Make verify fail on any bare local `<script src>` / `<link rel=stylesheet href>` in `client/*.html`
   (mockups excluded), so the class can't recur; one test.

## Don't
- Version icons/fonts/manifest refs unless decided separately (`vendor/fonts/*.css`, `logo-mark.svg`).

## Done when
- `node scripts/cache-bust.js` OK and fails on a bare-ref fixture; `npm test` green.
