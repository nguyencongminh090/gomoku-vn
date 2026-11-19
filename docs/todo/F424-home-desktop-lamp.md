# F424 — Home desktop redesign "Một ngọn đèn"
**Status:** OPEN (shipped to dev; open: real-mouse feel, Safari/Firefox)
**Area:** client/index.html, client/css/home-lamp.css, client/js/home-lamp.js, client/js/lobby-home.js, client/js/skin-preload.js, client/js/i18n.js, DESIGN.md
**From:** user picked mockup m9 on 2026-11-19 (`features/home-desktop-minimal/`): "Một ngọn đèn (Đèn trượt theo chuột)". Answers: update DESIGN.md and build; always dark; decorative stones.   **Depends:** —

## Problem
Desktop Home should be minimal and memorable, with Chơi ngay and Phòng chơi as the two clear actions.
## Scope
1. ≥861px: dark oak table; a lamp reveals a static grid and sample stones, follows the pointer, settles on the actions.
2. Reuse the real controls: `#qm-play`, `#qm-search`, `#hub-rooms`, chips, `#qm-challenge`, notices.
3. Remove room-code entry and the scoreboard from desktop Home. Keep the forum link (no nav entry exists).
## Don't
- Change phones (≤860px), the server, the game board or `board.js`.
- Animate stones or grid. Repaint per frame.
## Traps
- `.hq-play` carries a pill shadow and hover transform; the shell `:focus-visible` is `!important`.
- `.hq-go` and `.hq-code` are `display: contents`, so absolute controls resolve to `#screen-home`.
- Opening on `#rooms` or `#tournaments`: `data-lobby-start` (skin-preload.js) keeps the table off until `showScreen`.
- `skin-preload.js` must stay under 1 KB: `server/tests/compression.test.js` serves it as the uncompressed sample.
- Tab order follows the shared DOM (chips, Chơi ngay, Thách đấu, Phòng chơi, forum), not the visual order; reordering would change phones.
## Why this way
Layers move with `transform` only (window + counter-moved board, falloff, four plates), so a lamp move repaints nothing. Knowledge: fe-web-animation, vbase-depth-motion.
## Done when
- jsdom `client/tests/home-lamp.test.js` + full `npm test` green.
- Browser pass 861-1920, both modes, guest, English, search, picker, challenge, rooms tab, reduced motion, phone unchanged.
- User reviews on a real mouse; Safari/Firefox checked.
