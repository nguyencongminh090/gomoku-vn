# B378 — remaining per-move client cost in the room (after perf/play-lag)
**Status:** ✅ CLOSED 2026-11-16 — user closed; built in b02240e (on dev). Real-phone pass was never done. Prior: OPEN — built 2026-11-14 (fix-log 2026-11-14-378-per-move-board-patch.md), awaiting real-phone pass
**Area:** client/js/board.js, client/js/room-socket.js, client/js/room-ui.js, client/js/audio-manager.js
**From:** perf/play-lag measurement 2026-11-14   **Depends:** —

## Problem
After the fix, late-game `game:moved` is ~11.6 ms at 4× CPU (stone). What is left, measured by CDP profile:
- `board._draw` rebuilds the whole SVG per move (~6.7 ms late game, grows with stones).
- `RoomUI.updateUI()` runs on every `game:moved` though room data did not change (~3.5 ms: cards, settings, users, score table).
- Move sound builds new WebAudio nodes per move (createGain/BiquadFilter in profile).
## Scope
1. Board: append the new stone + move the last-move marker instead of a full `_draw` when exactly one stone was added.
2. `game:moved`: call only what a move changes (cards' turn/clock) instead of `RoomUI.updateUI()`.
3. Measure with tools/perf/harness.js (same params) before/after.
## Don't
- Don't change board look (board/stones locked by design-workflow).
## Done when
- Late-game handler cost measured lower; real-phone pass.
