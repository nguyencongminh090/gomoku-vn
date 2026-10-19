# B305 — Lobby "Diễn đàn" empty row: "Chưa có chủ đề nào." still wraps at >=1280
**Status:** OPEN
**Area:** client/js/i18n.js (home.no_forum), client/css/shell.css (.ppanel.is-empty)
**From:** found while doing #304 (round 3, 2026-10-19; not asked, so recorded only)   **Depends:** B300

## Problem
Same defect as #304: at 1280/1440 the status is 2 lines (height 35px) beside the 135px "Xem diễn đàn" pill; 768 and 375 are 1 line.
## Scope
1. Prefer a CSS/layout fix that also covers longer strings (e.g. status under title when the row is narrow) over another copy cut; check Hôm nay/Live still align.
## Don't
- Don't change what the card links to.
## Why this way
Knowledge: docs/knowledge/ui-ux/ticket-rows.md.
## Done when
- One line (or deliberate two-line layout) at 1280/1440, x aligned across the 3 rows.
