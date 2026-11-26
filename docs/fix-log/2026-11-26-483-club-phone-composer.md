# 2026-11-26 17:27 — #483 Club chat (phone): composer floats mid-screen on a short stream
## Prompt
"Do #481 482 483"
## Root cause
At ≤860px `.cl-hq` is a flex column sized to end at the tab bar, but `.cl-mid` (inside `display: contents` `.cl-content`) had no flex grow, so it took its content height; `.cl-stream { flex: 1 }` had no space to fill. The `/` popup added height, moving the composer.
## Fix
- `client/css/club.css` phone block: `.cl-mid { flex: 1; }`. Desktop grid untouched.
- Branch `fix/481-483-club-chat`; cache-bust `--write` (club.html, clubs.html).
## Verification
- New test in `client/tests/clubs-pages.test.js` (phone block has `.cl-mid { flex: 1;`): fails before, passes after.
- Real server + throwaway DB, Chromium 390×844: composer bottom vs tab bar top, before → after: 0 msg 361 → −1 px, 0 msg + `/` popup 130 → −1, 1 msg 287 → −1, 1 msg + popup 39 → −1, 30 msg −1 → −1 (−1 = tab bar border, same as before with a full stream). 0 console errors.
- Not run: real phone / iOS Safari, on-screen keyboard.
