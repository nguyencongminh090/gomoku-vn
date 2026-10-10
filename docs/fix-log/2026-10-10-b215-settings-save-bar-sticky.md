# 2026-10-10 22:39 — #215 Settings save bar never stuck / hid under the mobile tab bar
## Prompt
"#215" — todo: sticky save bar hidden under the mobile tab bar at 390px.
## Root cause
Not the 60px offset alone: `main.css` sets `html, body { overflow-x: hidden }`, so `body` computes overflow-y:auto and becomes
the scroll container for `position: sticky` while the viewport is what scrolls. `.pset__save` therefore never stuck on any
width (measured 390×844 / 1280×800: top 1139 / 1114 px at scrollY 0, i.e. only visible at the end of the page). Where it did
reach the bottom, its hard-coded `bottom: 60px` was also less than the tab bar (68px + safe-area), so Lưu sat under it.
## Fix
platform.css: `body.pl { overflow-x: hidden; overflow-x: clip }` (clip makes no scroll container; hidden stays as fallback);
`--ptabbar-h: 68px` on `.pl`; mobile `.pset__save { bottom: calc(var(--ptabbar-h) + env(safe-area-inset-bottom)) }`.
platform-shell.css: `.ptabbar` border-box + min-height of the same token, so bar and offset cannot drift. main.css untouched
(global; lobby/room keep today's behaviour). Branch fix/settings-save-bar-under-tabbar off dev (#215 exists only on dev). ?v=260.
## Verification
- client/tests/settings-save-bar-sticky.test.js (3 asserts, all failed before). npm test green.
- Real browser (isolated server copy, member): 390×844, 360×640, 390×844+safe-area: Lưu hit-tests as SAVE at scrollY 0/300/600/end
  (before: null/null/SAVE/TABBAR); bar bottom = tab bar top (776). Desktop 1280×800: bar pinned at the bottom (747–800).
  9 platform pages × 390: no horizontal overflow (scrollWidth = clientWidth).
- Not verified: a real iOS device's safe-area inset (env() is 0 in Chromium here).
