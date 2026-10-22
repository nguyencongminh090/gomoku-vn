# 2026-10-17 19:00 — #274 /puzzles filter/paging kept the lobby URL
## Prompt
Do #273 - 276 (ux-audit puzzle findings).
## Root cause
`history.replaceState(null,'','?'+q)` resolves against `<base href="/">` → `/?level=easy`; reload lands on the lobby.
## Fix
`puzzles.js` replaceState now `location.pathname + (q ? '?'+q : '')`.
## Verification
puzzle-solve-page.test.js: <base href="/"> case asserts pathname stays /puzzles and search is ?level=easy. Same bare-`?` pattern in forum.js:58, rankings.js:140 → #281. cache-bust --write/verify OK; npm test 3317 pass.
