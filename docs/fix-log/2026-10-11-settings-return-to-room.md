# 2026-10-11 18:00 — untracked Settings opened from a room had no way back
## Prompt
After configuring UI settings (moved to /settings.html) from inside a room, the user should return to the room.
## Root cause
Both entry points (room "Board look" link, shell user menu) navigated to a bare `/settings.html`; the page knew nothing about where the user came from.
## Fix
Entry points append `?return=<current path+query>`; `settings-page.js` validates it (single leading `/`, no `//`, `/\`, scheme, control chars → else ignored) and prepends a "Back to room / Back" button. No auto-redirect after Save (multi-tab page). `?v=289`.
## Verification
`client/tests/settings-tabs.test.js` (room return shown; 4 external forms rejected), `platform-shell.test.js` expectations updated; full `npm test` 2850 green. Not run in a real browser; leaving /room mid-game relies on existing reconnect (unverified).
## Follow-up (same day): button never appeared
`settings.html` has `<base href="/">`, so `select()`'s `history.replaceState(null,'','#look')` resolved to `/#look`, wiping path + `?return=` before `renderBack` ran (jsdom has no `<base>`, so the first test missed it; a reload would also have landed on the lobby). Fix: `replaceState(..., location.pathname + location.search + '#' + name)` + test. Verified in headless Chromium (static server, faked /api): button "Quay lại phòng" → `/room.html?id=abc`. `?v=290`.
