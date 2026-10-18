# B283 — Collapsing the docked rail mid-game hides clocks, game controls and request toasts
**Status:** FIXED 2026-10-18 (uncommitted) — real-browser VERIFIED: collapsed in a live game, clocks (y80/y226) + controls (y154) visible, draw-offer toast visible at y146. Evidence docs/audits/2026-10-18/13-live-collapsed.png, 14-*.png
**Area:** client/css/room-arena.css (`.rail-collapsed .rail`), client/room.html (rail layout), client/js/room.js (`setRailCollapsed`)
**From:** ux-audit Rooms 2026-10-18, finding H1 (`docs/audits/ux-audit-2026-10-18.md`)   **Depends:** ui/room-rail-dock merged

## Problem
Collapsed rail = `visibility:hidden` for everything in it. During an ongoing game both `.seatcard__clock`, `#game-controls` and `#game-toasts` (draw/undo/time requests) go offscreen. A player can lose sight of the clock or miss an opponent request. Request loss inferred from DOM, not yet exercised live.
## Scope
1. Reproduce live: 2 sessions, start, collapse, opponent offers draw/undo/time — confirm A never sees it.
2. While a game is ongoing (and you are seated), collapse only the tabs panel: keep seat cards + clocks + controls visible; or auto-expand on an incoming request.
3. Add a regression test (jsdom for the state rule; real-browser for visibility).
## Don't
- No `server/` changes; don't touch `board.js` / board rendering.
- Don't change mobile (≤768px) layout.
## Traps
- Request toasts live inside `.rpanel`, not the seat cards — hiding `.rpanel` alone also hides them; decide where they surface.
- `.rail` is `display:contents` on phones; rules must stay inside `@media (min-width:769px)`.
## Why this way
Spectator-style collapse is wrong for a seated player in a timed game; clock visibility is non-negotiable. Rejected: remove collapse during games (loses the feature where it's most wanted).
## Done when
- Seated, game ongoing, collapsed: clocks and controls visible; an incoming request is visible or auto-expands the rail.
- `npm test` green + real-browser pass, ?v= bumped.
