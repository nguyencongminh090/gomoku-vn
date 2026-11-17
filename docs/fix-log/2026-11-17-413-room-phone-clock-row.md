# 2026-11-17 18:04 — #413 Room phone clocks: one seat row above the board
## Prompt
User: on phones the players sat top/bottom with the clock at the card edge; the hand covered the clock. Picked mockup K1 (features/room-clock-mobile/). Follow-up: handle long names (ellipsis, responsive font on small screens).
## Root cause
Layout, not code: my card + clock sat under the board at the right edge (≤768px), exactly under the thumb that taps the lower board.
## Fix
- room-arena.css (≤768px only): both seat cards half width, sticky top:0; the bottom card gets the same flex order and a negative top margin + margin-left 50% — no DOM change, desktop/tablet grids untouched. Cell = avatar | name over clock (name gets the whole cell width), mirrored for me; turn/low fill the whole cell (::before inset 4px so the opaque card hides what scrolls under). Name clamp(12px,3.6vw,15px) + ellipsis; clock clamp(20px,6.4vw,26px). Status dot hidden on phones. Board caps: 1× --seatcard-h (60px) instead of 2× 52px → +44px board/stage room.
- room-stage.js: my phone bubble hangs under my card, right-aligned (.speech--right).
- room-ui.js: full name in the name's title.
## Verification
- 4 room suites updated/extended (order, negative margin, one seat row in caps, clamp fonts, mirrored areas, bubble class, title); npm test 243 suites / 4268 green.
- Real browser :3101 own DB, 24-char names ("WWWW…", Vietnamese): 390×844, 320×568 (name 12px, clock 20.5px, fits), 360 spectator, dark, empty seats, 1280 desktop unchanged; 0 console errors. Shots: features/room-clock-mobile/live/.
- Not verified: real phones / iOS Safari.
