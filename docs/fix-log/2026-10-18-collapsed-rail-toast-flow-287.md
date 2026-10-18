# #287 Collapsed in-game rail: request toast no longer covers the action tiles
**Root cause:** #283 shrank `.rpanel` to height 0 and kept `.gtoasts` absolutely positioned at its top, so the toast overlaid `#game-controls` below it.
**Fix:** room-arena.css (≥769px, collapsed + live only): `.rpanel` height auto / padding 0, `.gtoasts` `position: static` (8px side margin) so the toast takes flow space and the controls shift down. Open rail and phones untouched.
**Test:** `room-rail-dock.test.js` pins the CSS contract. Real-browser live check (offer pending → toast + 4 tiles visible) NOT yet done; `?v=` rewritten.
