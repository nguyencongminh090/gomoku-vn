# 2026-11-16 12:32 — #400 Pinch-zoom the board only
## Prompt
"Allow Zoom in/out the board by finger (for mobile). Only zoom the board, do not zoom all layout." Then: pinch + double-tap reset, "không có phím + -".
## Root cause
Feature, not a bug: board had no zoom; page zoom would scale the whole layout.
## Fix
client/js/board.js: pointer-event pinch/pan changes only the SVG viewBox (`_view/_applyView`, 1x–4x); `_cellFromClient` uses `_view()`; `_gesture` flag swallows the gesture's touchend; double-tap resets unless it is a move confirmation. Branch ui/board-pinch-zoom, merged dev 5d6e183. ?v= bumped via cache-bust (10 files).
## Verification
client/tests/board-pinch-zoom.test.js (6 cases); npm test 4062 green. User confirmed on real phone 2026-11-16.
