# B216 — Room redesign "Arena Focus" + SVG board + friendly-only undo/time
**Status:** ✅ CLOSED 2026-10-12 — closed by user request without review/merge; state at close: implemented on `ui/room-arena` 2026-10-10, uncommitted, awaiting user review
**Area:** client/room.html, client/css/room*.css, client/js/{board,game-ui,room-ui}.js, server/socket/handlers/GameHandler.js, i18n
**From:** user 2026-10-10, [features/room-redesign](../../features/room-redesign/user_story.md)   **Depends:** —

## Problem
Room chrome is the old zen layout; the board is small on phones, clocks are not where the eye is, and
undo/extra time are offered in rated games.
## Scope
1. Mockup `client/room-arena-mockup.html` (desktop + mobile) → user OK.
2. Rebuild room DOM: desktop board + clock rail (opp clock / actions + requests / my clock) + tabs;
   mobile opp bar / edge-to-edge board / my bar / 44px action bar / bottom sheet.
3. SVG board (port of GomokuBoardSite `board.js`, paper + stone) behind the `BoardRenderer` API, all pages.
4. One board-prefs store (localStorage, `boardprefschange` event) edited ONLY in Settings › Giao diện › Bàn cờ
   (theme, presets, custom colours, coords edge/cell, last move/move numbers, live preview); every board page
   (room, tournament-match, replay, puzzle, editor, review, diag) reads it; quiet `contrast.audit` → toast, no WCAG panel.
   Room Settings tab: room rules (host) + link only.
5. Server refuses undo + time requests when the game is rated (`FRIENDLY_ONLY`); client hides the buttons.
6. Rename "Chơi thường" → "Giao hữu" (vi strings).
## Don't
- Don't change game rules, wire shapes of existing events, or rating logic.
- No modal over the board for incoming requests; resign/draw need a confirm step.
- No helper text in the room chrome (user 2026-10-10: "Hạn chế text dài… Thông báo countdown qua toast. Giữ UI clean"):
  equal action tiles with one short label; counts in `title`; requests + confirm countdown as stacked toasts over the panel top.
## Traps
- `docs/knowledge/mobile-layout-zen-ui.md` (dvh, minmax(0,1fr), touch-action, pointerdown, z-index vs sheet).
- Clock code → `.claude/rules/diagnostic-page-sync.md`; diag uses the board too.
- Every client edit bumps `?v=N`.
- SVG gradient ids must be unique per board instance (mockup: 2 boards sharing `#gB` → stones grey when the first SVG is `display:none`).
- WCAG toast only where colours change (Settings), never over the room action bar/clock.
## Why this way
SKILLS_TREE a11y/colour/layout notes (via agent, 2026-10-10): non-modal requests, confirm destructive
actions, state not by colour only, tabular clock digits, ≥44px touch targets in the lower third.
## Done when
- Server + jsdom tests green; real-browser pass at 1280×900 and 390×844 with screenshots; ux-audit gates.

## Progress (2026-10-10, ui/room-arena, uncommitted)
Server FRIENDLY_ONLY (isRatedSetup/isRated, serialize().rated) · SVG board.js + BoardPrefs · settings-board.js ·
room.html/room-arena.css (zen drawer, quick-chat, room-zen.css + 4 tests removed; 4 new suites). npm test green;
two-user real-server pass 1280/390 (0 console errors). Not verified: iOS Safari, /diag after Start, tournament-match.
