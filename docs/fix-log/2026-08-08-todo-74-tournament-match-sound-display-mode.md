# Fix log entry — 2026-08-08 15:41

## Prompt

User reported: "User in Tournament room cannot set Display (Paper/Stone) and no sound."

## Action

Diagnosed and filed as `TODO.md #74` first (per this repo's "record, don't perform directly" rule),
then implemented on explicit "Do #74" instruction.

Two separate root causes, both stemming from `tournament-match.html` being built as its own page
(B50) rather than reusing `room.html`'s full infrastructure:

1. **No sound.** `tournament-match.html` never had a `<script src="js/audio-manager.js">` tag (only
   `room.html` does), so `window.audioManager` never existed on that page. Even with it loaded,
   `tournament-match.js` never called it anywhere — it handles its own `tmatch:*` socket events
   instead of reusing `room-socket.js`, which is where all the `playMoveSound`/`playWinSound`/
   `playLoseSound`/`playTimerTickSound` calls live for the regular room.
2. **No Display (Paper/Stone) control mid-match.** Confirmed as a deliberate design gap, not a bug —
   `tournament-match.js`'s own code comment (pre-fix) stated outright there was no in-match UI for
   it, unlike click-mode. The radio only ever existed in `room.html`'s Settings tab
   (`room-ui.js:320-324`), which `tournament-match.html` never had at all (nor should it get in
   full — most of that tab's controls, board size/win rule/Wall-Portal/Swap2/timer, are
   tournament-fixed and shouldn't be editable mid-match).

## Decision

Asked the user (via `AskUserQuestion`) which direction to take for item 2, since `docs/instruction/
B74-*.md` explicitly required confirming before coding: (a) a full Settings tab in
`tournament-match.html` with only Display mode editable, or (b) a Display mode control added to the
existing global "Cài đặt" gear-icon panel (`settings-panel.js`), applying everywhere. User picked
(b) — smaller change, reuses the existing `play3cr_board_display` localStorage key as one more
writer rather than adding a parallel setting, and structurally avoids ever exposing the
tournament-locked settings mid-match since there's no new tab to accidentally over-scope.

Branched `fix/tournament-match-sound-and-display-mode` off `dev` (not `main`) — same "tracking entry
only exists on `dev`" exception as `#73`.

**Incident during implementation:** partway through, an unexplained `git reset` + `checkout dev`
event appeared in the reflog that this session did not issue, silently discarding all uncommitted
content edits to `tournament-match.js`, `settings-panel.js`, `room-ui.js`, `i18n.js`, and the
`audio-manager.js` `<script>` tag in `tournament-match.html` (the separate `?v=` version-bump sed
pass survived only because it ran afterward, reapplying cleanly to the now-reverted files). Detected
via `grep` turning up empty for code that had just been written, confirmed via `git reflog`. Redid
all five files' edits from scratch and committed immediately afterward (branch-create + stage +
commit as one Bash call) to minimize the window for a repeat. Root cause of the reset itself was not
identified — no destructive git command was issued by this session between the branch checkout and
the loss.

## Summary output

Implemented:
- `tournament-match.js`: added `audioManager` calls at the same trigger points `room-socket.js` uses
  — `playMoveSound` in the `tmatch:moved` handler, `playWinSound`/`playLoseSound` in `tmatch:ended`
  (participants only, skipped on draw), `playTimerTickSound` in `tickLocal()` (own clock, final 10s,
  once per second). Added a `displaymodechange` listener that re-runs `updateBoardState()` so an
  open match board picks up a Display-mode change live.
- `tournament-match.html`: added the missing `<script src="js/audio-manager.js">` tag.
- `settings-panel.js`: added `getDisplayMode`/`setDisplayMode` (reading/writing the existing
  `play3cr_board_display` key) and a Paper/Stone segmented-control row in the "Ván đấu"/"Game" group,
  next to Sound. Dispatches a new `displaymodechange` `CustomEvent` on change.
- `room-ui.js`: added a `displaymodechange` listener (mirroring the existing `clickmodechange` one)
  so an open room's board also live-updates when Display mode is changed from the global panel.
- `i18n.js`: added `gset.display_mode` (vi: "Hiển thị bàn cờ", en: "Board display").
- Bumped `?v=84` → `?v=85` across every `client/*.html` and `client/js/*.js` occurrence, verified
  with the standard grep showing a single value.

Verified with a real running server + fresh throwaway SQLite DB (per the Playwright/e2e-safety rule
— real DB moved aside, restored after) + Playwright, guest-logging in and driving the real UI:
- Opened the global Settings panel on `index.html`, confirmed the "Hiển thị bàn cờ" row renders
  between Sound and default placement mode (screenshot), clicked "Quân đá" and confirmed both
  `localStorage['play3cr_board_display'] === 'stone'` and that the `displaymodechange` event fired
  with `{ mode: 'stone' }`.
- Loaded `js/audio-manager.js` the same way `tournament-match.html` now does and confirmed
  `window.audioManager` exists with all four sound methods (`playMoveSound`/`playWinSound`/
  `playLoseSound`/`playTimerTickSound`), no page errors.
- Fetched `tournament-match.html`'s served HTML and confirmed the new `<script>` tag is present.
- No console/page errors throughout.

Did not run a full two-player tournament-match game end-to-end (would require standing up a full
tournament + two guest sessions) — the sound call sites were verified by code inspection against the
exact `room-socket.js` trigger conditions they're ported from, plus the standalone `audio-manager.js`
load/API check above; this is a reasonable proxy given the wiring is a direct, mechanical port with
no new logic of its own. No `npm test` run — this is CSS/client-JS-only and `client/` has no
automated test runner, consistent with prior fixes touching this area (`#72`, `#73`).

Merged to `dev` with a regular merge commit; branch deleted afterward, per `CLAUDE.md`'s git
workflow.
