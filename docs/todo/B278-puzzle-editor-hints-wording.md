# B278 — Editor hints need prior knowledge
**Status:** OPEN
**Area:** client/js/puzzle-editor.js (count line), i18n puzzles.tool_portal
**From:** ux-audit puzzle 2026-10-17 (`docs/audits/ux-audit-2026-10-17-puzzle.md`), finding L2 (Low)   **Depends:** —

## Problem
"Đen 0 · Trắng 0 — Đen đi: số quân đen = trắng" and "Cổng (2 lần bấm)" are cryptic for a first-time author.
## Scope
1. Plain sentence, e.g. "Đen 4 · Trắng 4 — lượt Đen (hai bên bằng quân)"; clearer portal tool hint. vi + en keys.
## Don't
- Don't change validation rules.
## Done when
- Strings updated in both languages; existing tests adjusted.
