# Fix log entry — 2026-08-04 09:45

## Prompt

User report: "Time Plus not work" (the "Cộng thêm" / timer-increment field in the room's Time management settings).

## Action

Traced the field end to end. `server/managers/TimerManager.js:99-106` (`applyMove`) only adds `incrementSeconds` to the mover's clock when `this.mode === 'blitz'` — for `per_move` and `per_game` it's a no-op by design (confirmed by the room summary text at `client/js/room-ui.js:274-279`, which only prints `+Xs` for blitz). The bug is that the "Cộng thêm" input (`client/index.html:257-264` in the create-room modal, `client/js/room-ui.js:401-407` in the in-room settings tab) was shown fully enabled regardless of which Timer mode radio was selected. Since **per_move ("Mỗi nước") is the default-checked mode** in both the create modal and new rooms, a user who set "Cộng thêm" without separately switching to Blitz got an increment value that was silently discarded server-side — exactly matching "time plus not work".

## Decision

Fixed per the user's explicit choice (asked via AskUserQuestion, they picked "gray out the field unless Blitz is selected") rather than changing `TimerManager` to apply increment in all modes — that would be a game-semantics change beyond what was reported.
- `client/index.html`: `#timer-increment` starts `disabled`; wrapped its row in `#timer-increment-row` for opacity styling.
- `client/js/lobby.js`: new IIFE mirrors the existing Swap2⇄wall/portal interlock pattern — toggles `disabled`/opacity on `#timer-increment` when `timerMode` radios change, zeroing the value when leaving Blitz; `readFormSettings()` now force-zeros `timerIncrementSeconds` unless `timerMode === 'blitz'`; `applySettingsToForm()` re-dispatches a `change` event on the timerMode radios (same as it already does for openRule) so recalling "last settings" re-syncs the disabled state.
- `client/js/room-ui.js`: the in-room settings tab re-renders its whole form from `s.timerMode` on every update, so the increment row template directly conditions `disabled`/opacity on `s.timerMode === 'blitz'` (no extra listener needed); `updateSettings()` now zeroes `timerIncrementSeconds` before emitting `room:settings` unless the selected mode is `blitz`, so a stale/ignored value can't be persisted as an active-looking setting.
- Cache-busting: `?v=42` → `?v=43` bumped across all HTML files and the ES-module entry files, per CLAUDE.md.

No `TimerManager.js` change — server-side increment semantics (blitz-only) are unchanged and already covered by `server/tests/TimerManager.test.js`.

## Summary output

`npm test`: 21 suites / 401 tests passed, unaffected (this fix touches only `client/js/` and `client/index.html`, which have no test infrastructure per CLAUDE.md — noted explicitly rather than skipped silently). No server-side behavior changed. Manual verification: opening the create-room modal now shows "Cộng thêm" disabled/dimmed under the default per_move mode and re-enables only when Blitz is selected; switching away from Blitz resets the value to 0 both in the create modal and the in-room settings tab.
