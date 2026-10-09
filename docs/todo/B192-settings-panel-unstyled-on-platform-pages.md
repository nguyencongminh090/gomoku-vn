# B192 — Settings panel renders unstyled on rankings/profile/clubs/club
**Status:** ✅ FIXED 2026-10-09 — [fix-log](../fix-log/2026-10-09-todo-192-settings-panel-unstyled-platform.md)
**Area:** client (html)
**From:** user report 2026-10-09 ("Settings UI lỗi")   **Regression of:** B190 (Settings gear on platform pages)

## Root cause (verified by screenshot, faked API, 1280×900)
`rankings.html`, `profile.html`, `clubs.html`, `club.html` load `js/settings-panel.js` but not
`css/settings-panel.css` → `.gset-*` overlay/panel has no styles; the panel is dumped as plain text at
the bottom of the page. Lobby/history/room/tournament load the CSS and render fine.

## Scope
- Add `<link rel="stylesheet" href="css/settings-panel.css?v=N">` to the 4 pages; bump `?v`.
- Check the panel against `platform.css` tokens (Arena dark + light) — no other restyle.
- Regression test: a client test asserting every page that loads `settings-panel.js` also links `settings-panel.css`.

## Don't
- Don't restyle the lobby "tab index" here — that is R1 in `features/platform/planning.md`.
