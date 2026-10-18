# #283 Collapsed rail keeps clocks, controls and request toasts in your own game
**Root cause:** `body.rail-collapsed .rail` = `translateX(100%)` + `visibility:hidden` for the whole rail, with no game awareness.
**Fix:** room-arena.css (≥769px only): when `#game-controls` is non-empty (only while seated in your own game) the collapsed rail stays visible but shrinks to seat cards + controls; `.rpanel` tabs hide, `.gtoasts` (inside `.rpanel`) stay. `.room` keeps its right padding. No JS, no server, phones untouched.
**Test:** `client/tests/room-rail-dock.test.js` pins the CSS contract (jsdom has no layout). Real-browser visibility NOT yet verified.
