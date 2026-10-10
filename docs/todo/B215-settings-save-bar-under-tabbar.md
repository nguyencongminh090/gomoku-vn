# B215 — Settings: sticky save bar hidden under the mobile tab bar
**Status:** OPEN — fixed 2026-10-10 on `fix/settings-save-bar-under-tabbar` (`?v=260`), awaiting review/merge
**Area:** client/css/platform.css (`.pset__save`), client/css/platform-shell.css (`.ptabbar`)
**From:** report 2026-10-10 (Settings → Hồ sơ review), measured on a seeded copy   **Depends:** —

## Problem
≤860px: `.pset__save` is `position: sticky; bottom: 0`, the tab bar is `position: fixed` ~72px tall. Mid-scroll at 390×844 the
save bar sits at y 787–840 and the tab bar starts at y 779 → `elementFromPoint` on Lưu returns the tab bar. Only reachable at page end.
## Scope
1. Root cause first (sticky offset ignores the fixed bar); likely `bottom: <tab bar height + safe-area>` on mobile.
2. Kept regression test + fix-log entry; `fix/*` off origin/main (#211 is on main).
## Done when
- Lưu visible and clickable mid-scroll at 390; desktop unchanged.
