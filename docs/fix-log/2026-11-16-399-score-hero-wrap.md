# 2026-11-16 12:30 — #399 phone Tỉ số "8–16" wrapped onto two lines
## Prompt
"Measure font size for mobile (Table). User report: Tỉ Số wraps (8- and 16 on newline)" → "size small? do it now + write fix log"
## Root cause
`.score-hero__num` (room-stage.js `${a}–${b}`) was a shrinkable flex item between two 34%-wide name blocks; the en dash is a line-break opportunity, so at ≤360px (40px font) it broke after "8–". Measured (Chrome, static page with real CSS): 320 and 360px → 2 lines; ≥375px → 1 line.
## Fix
room-arena.css: `.score-hero__num { flex: none; white-space: nowrap }`; `@media (max-width:360px)` number 32px, gap 10px. Other sizes unchanged (names 12px, game table 13px).
## Verification
room-stage.test.js: 2 new tests, red before / green after. Chrome measure after fix: "8–16" and "16–16" 1 line at 320/360/375/390. cache-bust OK. Not checked: real room page / long names in the game table at 320px (row wraps, separate).
