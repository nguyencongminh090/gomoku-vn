# B464 — Tournament sub-tabs wrap to 2 lines on mobile
**Status:** OPEN
**Area:** client/css/tournament.css (.sub-tabs, .sub-tabs__btn)
**From:** features/club-platform/screenshots/team-standings-mobile.png (390 px), 2026-11-25   **Depends:** —

## Problem
At 390 px "Cặp đấu", "Bảng xếp hạng", "Lịch sử ván đấu" each wrap to 2 lines.

## Scope
1. Fix in `.sub-tabs` / `.sub-tabs__btn` only (one-line labels, horizontal scroll or tighter gap).
2. Ground the choice in `docs/knowledge/ui-ux/INDEX.md`.
3. CSS/jsdom test for the rule; real-browser pass (`browser.cjs team`) desktop + mobile.

## Don't
- Restyle anything else.

## Done when
- Mobile shot shows one-line tabs; desktop unchanged; test kept; real DB md5 unchanged.
