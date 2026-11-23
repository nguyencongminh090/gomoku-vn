# 2026-11-24 03:40 — untracked crosstable horizontal scroll
## Prompt
"cho phép cuộn ngang để tránh các cột bị tràn hoặc quá nhỏ"
## Root cause
`.score-games` was `width:100%` with no scroll wrapper, so many players = squeezed or overflowing columns.
## Fix
`room-stage.js`: table wrapped in `.score-games-wrap`. `room-arena.css`: wrapper `overflow-x:auto`; table `min-width:100%; width:max-content`; cells `nowrap`, `min-width:44px`. Branch `fix/crosstable-hscroll`, `?v=` rewritten.
## Verification
1 new jsdom test (wrapper + CSS rules), room-stage suite 46 pass. Not verified: real browser / phone, full `npm test`.
