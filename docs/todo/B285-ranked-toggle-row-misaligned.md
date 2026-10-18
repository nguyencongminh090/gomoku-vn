# B285 — Disabled "Tính điểm xếp hạng" row: switch misaligned by ~8px
**Status:** DONE
**Area:** client/js/room-ui.js (`rankedBlocked` label in `renderSettings`), client/css/room.css (`.toggle-row`)
**From:** ux-audit Rooms 2026-10-18, finding L1 (`docs/audits/2026-10-18/03-settings-dropdowns.png`)   **Depends:** —

## Problem
When a guest is seated, the `<small>` hint wraps and the switch sits at x 1368–1410 vs 1358–1402 for the other toggles.
## Scope
1. Let the label shrink (`min-width:0; flex:1`), keep the switch `flex:none`.
2. Check at 340px rail width, with and without the hint.
## Don't
- Don't reword the hint copy.
## Done when
- All switches share the same right edge; screenshot compared.
