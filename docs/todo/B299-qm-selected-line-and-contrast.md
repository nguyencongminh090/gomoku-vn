# B299 — "Đang chọn: …" line is the CTA's config: make it read first; re-measure secondary text contrast
**Status:** ✅ DONE 2026-10-19 — .qm-line 12.5px/400 --c-ink-2 → 14px/600 --c-ink (12.41:1 dark, 14.5:1 light; line-height 1.5). Contrast pass (WCAG 1.4.3 / 1.4.11, real browser, guest + member, 375/768/1280/1440, dark + light): all secondary text ≥ 4.5:1 and all unselected control borders ≥ 3:1 after #297 — no token change needed. Before→after (1280 dark/light): qm-lbl LUẬT CHƠI/THỜI GIAN/BIẾN THỂ 6.23/6.76 (pass, unchanged); "Cả ván/Mỗi nước" 3.31/3.14 → 5.24/6.07 (was failing: opacity .7 from #293); "Chưa có … nào" 6.23/6.76 unchanged; habout dd 6.23/6.76 unchanged; stat labels 7.35/5.67 unchanged; unselected time chip text 3.36/3.15 → 5.24/6.1; chip border 4.15/3.73 → 3.80/3.35 (first try 62% mix gave 2.83 in light → 70%); secondary-action border 1.36 → 7.37. Selected chip: text on fill 4.9 dark / 4.98 light, fill vs card 3.16 dark, ✓ kept. Hint + optional lines 6.23/6.76.
**Area:** client/css/shell.css
**From:** lobby UI audit round 2 (user, 2026-10-19)   **Depends:** B297, B298

## Problem
The line that says which config the CTA will start looked like a caption; contrast of secondary text was never measured after round 1's dimming.
## Scope
1. Larger/bolder line. 2. Measure; raise tokens only if a pair fails.
## Don't
- No token edits when nothing fails (none did).
## Traps
- Measured with a script that composites opacity + alpha borders onto the real ancestor background; the 1.4.11 boundary uses the border colour against the card.
## Why this way
Knowledge: docs/knowledge/ui-ux/vbase-color.md (4.5:1 / 3:1), vbase-visual-principles.md (hierarchy), vbase-typography.md.
## Done when
- Numbers recorded above; `npm test` green.
