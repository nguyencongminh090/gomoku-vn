---
name: mobile-layout-zen-ui
description: Recurring mobile and zen-skin layout traps in gomoku-vn (z-index vs bottom sheet, overlay anchoring, grid tracks, dvh, touch order, orphaned selectors, inert drawer) with the fix that worked
domain: gomoku-vn
tags: css,mobile,zen,layout,touch,ios-safari,accessibility
apply_when: "before editing client/css/room-zen.css, room.css, game.css, board.js resize(), or touch/focus handlers on the room page"
sources: "2026-08-21-todo-139-mobile-start-modal-behind-sheet, 2026-08-22-todo-137-start-modal-overlay-respects-drawer, 2026-08-22-todo-142-grid-track-day-rail-ra-khoi-drawer, 2026-08-14-todo-118-mobile-board-resize-dvh, 2026-08-21-todo-133-mobile-grid-line-board-size, 2026-08-21-todo-133-vong-2-truc-ngang-tran-vien, 2026-08-11-todo-104-mobile-touch-scroll-chatbox, 2026-08-09-todo-90-tournament-match-resize-scroll-jump, 2026-08-23-todo-151-quick-chat-blur, 2026-08-21-todo-135-svg-icon-orphaned-selectors, 2026-08-22-todo-138-drawer-inert-when-collapsed; TODO #90 #104 #118 #133 #135 #137 #138 #139 #142 #151"
last_reviewed: 2026-10-09
confidence: high
---
# Mobile layout and zen UI traps

## Why this note exists
The room page stacks a drawer/sheet, overlays, a canvas board and chat. Most bugs came from two individually correct rules colliding, or from a CSS/JS assumption that only fails on a phone. #133 took four rounds, #142 five.

## Facts and rules
1. Mobile breakpoint is `max-width: 768px` in `client/css/room-zen.css`. There the sheet `.panel-right-shell` has `z-index: 700` (above `.btn-focus` 600 and `.float-messages` 550).
2. `.start-modal` must sit above the sheet: `z-index: 750` inside the `<=768px` block (#139). `#start-modal-btn` is the only way to press Start.
3. Keep the overlay `pointer-events: none` (only the card catches clicks) so it never blocks the drawer on desktop (§B36); a test pins this.
4. Anchor the mobile overlay to the strip between topnav and sheet: `position: fixed`, `height: max(180px, calc(100dvh - var(--zen-topnav-h) - var(--zen-sheet-h)))` (variant with `--zen-bar-h` when collapsed).
5. Do not make the modal toggle `zen-drawer-collapsed`: it creates another source of truth for that class (#139).
6. In zen, `.room` is `display:block`, so the shell is not a grid column. `inset:0` resolves against the padding box and spans the drawer strip (#137). Do not reparent the modal under `#board-area`: `GameUI.initBoard()` overwrites its `innerHTML`.
7. Fixed-width grids need `minmax(0, 1fr)`, not `1fr`: `.panel-right` uses `grid-template-columns: minmax(0, 1fr) var(--zen-rail-w)` (#142). `min-width:0` on children does not lower the grid track's min-content.
8. Use `100dvh` after a `100vh` fallback line (`room.css`, `room-zen.css`); iOS Safari pins `vh` to the tall viewport (#118).
9. The `resize` handler in `game-ui.js` is rAF-gated via `window._boardResizePending`; never call `BoardRenderer.resize()` per move (#90 scroll jump through scroll anchoring).
10. `board.js` `_onTouchEnd` calls `e.preventDefault()` first, before any guard (#104). The canvas rule in `game.css` needs `touch-action: none`.
11. Use `pointerdown`, not `click` (≈300 ms late on mobile). `#quick-chat-input` is blurred from a `pointerdown` on `#board-area-shell`, a stable container (#151).
12. Drawer collapse is visual only. `syncDrawerInert()` / `setDrawerCollapsed()` in `room.js` are the single writer of `inert`; route all class changes through them (#138).
13. After any markup migration, grep CSS for selectors on the old tag (`i` to `.icon`, #135).
14. Zen mobile board budget uses zen overheads, not the non-zen `-14 -16 -12 -8` (#133).

## Symptom -> real cause -> fix
| Symptom | Cause | Fix |
|---|---|---|
| Start button unreachable on phone | z-index 50 vs sheet 700 | 750 plus anchoring (#139) |
| Rail pushed off, double line | `1fr` min-content from long names | `minmax(0,1fr)` (#142) |
| Keyboard pops when tapping board | `preventDefault` after guard; no `touch-action` | move first (#104) |
| Page jumps on move | per-move canvas resize | remove call (#90) |
| Hidden inputs reachable by Tab | collapse is visual | `inert` (#138) |

## Verify before calling it fixed
- Playwright with `devices['Pixel 5']`, real `page.click()`, isolated server and DB (see `playwright-e2e-safety`).
- Use long display names, both collapsed and open drawer, and a short viewport (360x560).
- #118 cannot be reproduced in Chromium emulation; mark it unverified on iOS.

## Do not use when
Lobby, login or non-zen desktop-only styling.

## Related
`engineering-method-lessons.md`; TODO #134 #136 #137 #139; `docs/instruction/B137-*`, `B139-*`.
