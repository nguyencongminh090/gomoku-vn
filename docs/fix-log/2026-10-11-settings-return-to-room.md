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
## Follow-up 2: floating button, room-only
Header button looked off-layout → 52px round FAB (`.pset__back`, fixed bottom-right, above the save bar / mobile tab bar), icon-only with aria-label + title. Shown only for `?return=` that is a `/room[.html][?query]` path; shell menu adds `?return=` only on /room. Checked in headless Chromium at 1280×800 and 390×780 (no overlap with tab bar). `?v=291`.
## Follow-up 3: Zen arrow = background colour
`.pl a {color:inherit}` (0,1,1) beat `.pset__back` (0,1,0) → arrow took the page ink (#ececec in Zen dark = `--c-brand`). Selector now `.pl .pset__back` so `color: var(--c-on-brand)` applies: Zen light white on #1c1c1c, Zen dark #121212 on #ececec. CSS-source test added. `?v=292`.
## Follow-up 4: softer + draggable
Soft look: 48px, translucent `--c-surface-2` + blur, 1px border, `--c-brand` arrow, light shadow; fade/scale-in, hover/press scale, snap transition (all off under prefers-reduced-motion). Draggable (pointer events, capture on pointerdown): clamped below the nav / above the tab bar, snaps to nearest side edge, position kept in sessionStorage `gvn_back_pos`, a drag never fires the link (<6px = click). Checked with real mouse drag + reload in Chromium. `?v=294`.
