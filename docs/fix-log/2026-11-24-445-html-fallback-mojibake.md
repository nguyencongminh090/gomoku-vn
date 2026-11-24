# 2026-11-24 — #445 Mojibake "nhÃ³m" in HTML fallback text
## Prompt
Do #445.
## Root cause
#375 fixed double-encoded UTF-8 in i18n.js/routes only; 15 static strings/placeholders in client/club.html (8), clubs.html (5), index.html (1) still held `Ã³` for `ó`.
## Fix
`Ã³` → `ó` in client/*.html (only sequence present). cache-bust --write: 0 files needed (HTML not hashed).
## Verification
New test in rankings-i18n-mojibake.test.js scans client/*.html (failed on 14 lines before, passes after). cache-bust.js OK.
