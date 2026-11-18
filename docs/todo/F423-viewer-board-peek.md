# F423 — Viewers can tap/hover the room board (highlight overlay only)
**Status:** ✅ BUILT 2026-11-18 on ui/viewer-board-peek — jsdom tests; no real-browser pass yet
**Area:** client/js/board.js (`peek`, `_peeking`, `_toggleMark`, `.gboard__mark`), client/js/game-ui.js (`peek: !myPlayer`)
**From:** user 2026-11-18 "Allow viewer hover/click on board (overlay only) — cho phép khách nhấn lên bàn cờ trong lúc xem, hiển thị highlight."

## Scope
1. Renderer option `peek` (setState). Active only when `peek && !interactive`.
2. Viewer hover → same dashed hover ghost as a player (empty cells). Click / tap → toggles one local highlight (`.gboard__mark`, pending colour), on any cell incl. stones; same cell again clears it.
3. Room sets `peek: !myPlayer` whenever a game exists; sitting down (interactive) / peek off clears the mark.
## Don't
- Call `onCellClick`, emit anything, or share the mark with others (overlay only).
- Change player behaviour: interactive boards ignore `peek`.
## Traps
- Double-tap on a zoomed board still resets zoom (first tap toggles the mark on, second resets zoom).
- Tournament match spectators not wired (`tournament-match.js`) — not asked.
