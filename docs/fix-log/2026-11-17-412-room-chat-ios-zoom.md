# 2026-11-17 15:47 — #412 Room chat input zooms page on iPhone
## Prompt
"Khi kích chat bàn cờ nó thế này / Ko thu lại được đó @Ngmint" (iPhone, screenshot of zoomed room).
## Root cause
Dock chat input is 13px (room.css `.chat-input input`). iOS Safari auto-zooms the page when an input
under 16px gets focus and keeps the zoom after blur; the room locks document scroll and #400 board pinch
takes pinch-out over the board, so the user is stuck zoomed in.
## Fix
client/css/room-arena.css phone block: `body.arena-room .chat-input input { font-size: 16px; }` (same
pattern as platform.css F2 / puzzles.css). ?v= rebumped via cache-bust (room.html).
## Verification
client/tests/room-arena-mobile-sticky.test.js new #412 case (failed before, passes after). No real-iPhone
pass yet: iOS focus zoom can't be reproduced in desktop Chrome/jsdom.
