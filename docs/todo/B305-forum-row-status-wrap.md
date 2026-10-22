# B305 — Lobby "Diễn đàn" empty row: "Chưa có chủ đề nào." still wraps at >=1280
**Status:** ✅ DONE 2026-10-20 — shell.css only: the lobby right column (`.psplit > aside`) is a size container; at <=520px wide the empty rows use the phone layout (status under the title, pill right). Measured guest, 900/1024/1280/1440 dark+light: status 1 line, same x in all 3 rows, heights 84/84/64 (Live has no pill), no h-overflow. Tried first: gap 12px — status still 2 lines (needs ~113px, had 102). Not checked: English, rows with data, browsers without container queries (fall back to the old single-row layout).
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
