# 2026-10-17 19:00 — #276 /puzzles filter bar labelled, even rhythm
## Prompt
Do #273 - 276 (ux-audit puzzle findings).
## Root cause
`.pbar` is `space-between` with two groups and a third `#pz-tags` outside it, inline margins, no group names.
## Fix
New `.pz-filters` block (puzzles.css): three `.pz-filter` rows, label column + chips column (`flex:1`, so wrapped Chủ đề chips stay beside the label at 375), 12 px gaps, `min-height:34px` reserves the JS-rendered chip row. `.pbar` untouched (shared).
## Verification
jsdom: three labels, tags inside the block. Real browser (Chromium, scratch server+DB): screenshots 375/1280 OK, no h-scroll at 375/768/1280; CLS median 375 0.0065 / 768 ~0.005 (0.0157 on some runs) / 1280 0.0027 vs old 0.0085/0.0046/0.0029 (all < 0.1).
