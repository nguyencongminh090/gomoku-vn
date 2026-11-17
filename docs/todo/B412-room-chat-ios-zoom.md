# B412 — Room chat input zooms the page on iPhone and it stays zoomed
**Status:** ✅ DONE 2026-11-17 (merged dev; real-phone check not done)
**Area:** client/css/room-arena.css, client/tests/room-arena-mobile-sticky.test.js
**From:** user report 2026-11-17 (iPhone, small screen), screenshot   **Depends:** —

## Problem
"Khi kích chat bàn cờ nó thế này / Ko thu lại được đó". Tapping the dock "Bình luận…" input on iOS Safari
zooms the whole page (board cut off right/top, black strip left); after blur it never zooms back.
## Scope
1. Phone room dock chat input font-size >= 16px (iOS auto-zoom threshold).
## Don't
- No `maximum-scale=1` / `user-scalable=no` in the viewport meta (a11y; #400 board pinch is separate).
## Traps
- `.chat-input input` in room.css is 13px; the phone override must live in room-arena.css's 768px block.
- Pinch-out on the board is consumed by #400 board zoom, so the user cannot undo a page zoom there.
## Done when
- On a real iPhone, focusing then dismissing the room chat input leaves the page at 1x.
