# B276 — /puzzles filter bar: unlabeled groups, uneven rhythm
**Status:** ✅ DONE 2026-10-17 — see fix-log 2026-10-17-puzzles-filter-bar-276
**Area:** client/css/platform.css:75,81, client/puzzles.html:30-40
**From:** ux-audit puzzle 2026-10-17 (`docs/audits/ux-audit-2026-10-17-puzzle.md`), finding M2 + layout review (div.pbar)   **Depends:** —

## Problem
Level left, Luật pushed far right (space-between), Chủ đề on its own row; gaps 16/14/20 px; no visible group names; 3 rows at 375.
## Scope
1. One filter block; small visible labels (Độ khó / Luật / Chủ đề); justify-content:flex-start; one gap token; #pz-tags inside the block; drop the inline margin.
2. Screenshots at 375/768/1280 before/after.
## Don't
- Don't change chip behaviour or filter state logic.
## Done when
- Even rhythm, labels visible, no CLS regression (was 0.003/0.009); ?v= bumped.
