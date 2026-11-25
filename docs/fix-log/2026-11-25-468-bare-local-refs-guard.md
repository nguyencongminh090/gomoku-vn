# 2026-11-25 16:50 — #468 Bare local script/style refs escape cache-bust + verify guard
## Prompt
"Do #468 - 471"
## Root cause
`cache-bust.js` only rewrites refs that already carry `?v=<hex>`; a tag added without a placeholder
is invisible to it, so the file is served `immutable` with no version and edits stay cached.
Third hit of the class (#429 renju.js, #463 club-policy.js). Left: admin.html `js/admin-clubs.js`,
room.html `js/qrcode-generator.js`, profile.html `css/profile.css`.
## Fix
- `scripts/cache-bust.js`: `bareRefs(html)` finds local `<script src>` / `<link rel=stylesheet href>`
  without `?v=` (HTML comments ignored; external, `//`, `vendor/fonts/*` exempt per B468 Don't);
  `run()` reports each as an error, so verify (and the jest "real client/ tree" test) fails.
- The three refs → `?v=0` + `--write`.
## Verification
`server/tests/cache-bust.test.js`: bareRefs case table + run() fixture red on bare / green after
`?v=0`+write. Before the HTML edit verify listed exactly the 3 refs; after: OK. Full `npm test` green.
