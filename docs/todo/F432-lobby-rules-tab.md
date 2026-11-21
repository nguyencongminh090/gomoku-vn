# F432 — Lobby Phòng screen (index.html#rooms): "Luật chơi" tab
**Status:** ✅ DONE 2026-11-21 (browser checked at 1280, 390 and 320 px)
**Area:** client/index.html, js/lobby-home.js, js/room-rules-guide.js, js/index-entry.js, css/rooms-hall.css, css/rules-guide.css, i18n
**From:** user 2026-11-21 "I was mean add Rule to index#room" (#431 had put it in room.html)   **Depends:** F431

## Scope
1. The room hall opens at `index.html#rooms` and accepts `#room` as an alias. Its header has keyboard-operable "Đang chơi N" and "Luật chơi" tabs.
2. The guide is drawn on first open in Vietnamese or English. An illustrated introduction precedes winning rules, board variants and openings. Each rule shows a summary and expands to reveal worked examples.
3. Use the room hall’s layout and spacing tokens for desktop comparison and single-column reading on phones. See `docs/knowledge/ui-ux/vbase-layout-spacing.md`.
## Don't
- #431's room.html tab was removed on the user's request (2026-11-21): the guide lives only on the lobby Phòng screen.
## Traps
- New import in index-entry.js needs a modulepreload hint + count 10 in the modulepreload test.
- "online" line is hidden on the rules tab (class is-off).
