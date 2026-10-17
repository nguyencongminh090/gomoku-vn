# 2026-10-17 19:00 — #276 /puzzles filter bar labelled, even rhythm
## Prompt
Do #273 - 276 (ux-audit puzzle findings).
## Root cause
`.pbar` is `space-between` with two groups and a third `#pz-tags` outside it, inline margins, no group names.
## Fix
New `.pz-filters` block (puzzles.css) with three `.pz-filter` rows: visible label + chips, flex-start, one 12/8 px gap; `.pbar` untouched (shared).
## Verification
jsdom: three labels, tags inside the block. Not measured: screenshots at 375/768/1280 and CLS (CSS layout) — needs a real-browser pass. cache-bust --write/verify OK; npm test 3317 pass.
