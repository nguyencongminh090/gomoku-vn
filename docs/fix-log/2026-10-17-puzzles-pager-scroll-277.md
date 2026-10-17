# 2026-10-17 16:42 — #277 /puzzles pager lands at the first card
## Prompt
Do #277 - 279 (ux-audit puzzle findings).
## Root cause
Pager click only re-rendered #pz-list; nothing moved the viewport, so scrollY stayed mid-list.
## Fix
load(toTop) — Trước/Sau pass true and scrollIntoView({block:'start'}) #pz-list after render; first load and filter chips do not.
## Verification
jsdom: scrolls on Sau/Trước (context #pz-list), not on boot or chip click. Real browser (Chromium 390×844, scratch DB, 45 puzzles): OK, no console errors.
