# B304 — Lobby "Hôm nay" empty row: status wraps to 2 lines between title and button
**Status:** ✅ DONE 2026-10-19 — copy shortened (home.no_today vi): "Chưa có giải nào đang mở." → "Chưa có giải nào." (title "Hôm nay" + button "Xem giải đấu" already say "open"). Measured guest, 1280/1440: status 1 line, x identical to Đang phát trực tiếp (941 / 1021), row 64px; 768 x=192, 375 x=32 unchanged. Layout (#300 grid) untouched. Not checked: English (already short), registered-user states with a tournament.
**Area:** client/js/i18n.js
**From:** lobby UI audit round 3 (user, 2026-10-19)   **Depends:** B300

## Problem
At >=1280 the status shared ~118px with the button and wrapped, so the row read as cramped.
## Scope
1. Shorten the string; keep the button right and the shared title column.
## Don't
- No CSS change; the #300 alignment must hold.
## Why this way
Rejected: status under title (breaks alignment with the Live row). Knowledge: docs/knowledge/ui-ux/vbase-layout-spacing.md, ticket-rows.md.
## Done when
- One line at 768/1280/1440; `npm test` green.
