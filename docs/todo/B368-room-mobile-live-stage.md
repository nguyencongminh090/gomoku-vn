# B368 — Room mobile: "Live stage" panel (direction C)
**Status:** OPEN
**Area:** server/socket (room:react), client/room.html, client/css/room-arena.css (≤768px), client/js/room.js (+ chat render), i18n
**From:** user 2026-11-13 "Redesign for Table (bàn chơi) for Mobile only" → picked **C** ("Choose C.")   **Depends:** —
Mockup: `features/room-mobile-panel/mockups/index.html` (frame C), shots in `features/room-mobile-panel/shots/`.

## Problem
Phone room: minimized panel = ▲ + input, leftover space under the cards is empty; spectators hidden in a tab.

## Scope
1. Keep header, seat cards, clocks, board, game-controls row unchanged.
2. Player chat → speech bubble attached to that player's seat card, auto-fades ~4 s, `pointer-events:none`.
3. Spectator chat → pill comments rising from bottom-left (max 3, older fade).
4. Spectators out of tabs: avatar-only stack (3 + "+N", live dot) bottom-left of the dock; tap → avatar grid popover.
5. Dock: stack · input · react 👏 · ▤ (history sheet, unread badge).
6. History sheet (handle/▤): tabs Chat · Tỉ số · Nước đi; "Người xem" tab → "Tỉ số" (score table only).
7. Drop ▲ expand mode. Settings tab KEPT as 4th sheet tab: the header gear is personal settings only; room rules (board size, timer…) live in this tab — deviation from the user's "Bỏ" answer, reported back.
8. Reactions 👏: new socket event `room:react` (rate-limited, broadcast to room) — user approved backend 2026-11-13.
9. Round 2 (user: "chưa giống trọn vẹn mockup"): per-game log `room.gameLog` (server, user approved), score hero + dots + rows, pill tabs, chat faces, moves grid, audience grid, stage handle/swipe, 5-emoji burst, send button only while typing, "Bình luận…".

## Don't
- Server changes limited to room:react + room.gameLog (both user-approved 2026-11-13).
- Don't touch board.js / board rules in game.css. Desktop layout unchanged.

## Traps
- Phone layout invariants in room-arena.css (single `.room` scroller, sticky stack, `--board-h`, keyboard handling) — see memory/`project-platform-direction`.
- Bubbles must not block board taps; reduced-motion → no float, plain fade.
- game.css shared with tournament-match.

## Done when
- jsdom tests for bubble routing (player vs spectator), stack count, sheet tabs; real-browser pass 390×844 + 375×667, light/dark.

## Progress 2026-11-13 (branch ui/room-live-stage, uncommitted)
Built: server room:react (+ChatReaction.test), room.gameLog (+room-game-log*.test), client/js/room-stage.js (+room-stage.test, replaces room-panel-minimize.test), game-ui moves grid, chat-ui faces, room.html/css/i18n. npm test 3712 green, cache-bust OK.
Real browser (Chromium mobile emu, isolated :3101 + temp DB, 2 players + 2 spectators + desktop): 0 console errors; shots in features/room-mobile-panel/live/.
Not verified: real iOS/Android keyboard with input in the dock, WebKit.
