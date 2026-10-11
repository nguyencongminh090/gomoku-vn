# 2026-10-11 12:32 — #218 Room mobile: minimized chat bar 16px below the fold on iPhone 13 (Safari)
## Prompt
"Hãy test iOS" → found in WebKit iPhone 13 emulation; user: "okay" to the proposed fix.
## Root cause
The board was width-bound (≈ viewport width) on every phone; only screens ≤600px tall were capped by height. At 390×664
(iPhone 13, Safari bars shown) nav 48 + 2×52 cards + board 389 + tiles 62 + bar 77 = 680 > 664 → input cut, .room scrolled 16px.
## Fix
room-arena.css: on all phones cap the board width (= height) at `100svh − nav − 2·pcard − --tiles-h(62) − --minbar-h(77)`,
min 260px; the ≤600px rule (more panel room) still wins after it. svh = bars shown, so the board never resizes while bars hide.
## Verification
- Test: room-arena-mobile-sticky (board cap guard). Full npm test green. ?v=287.
- WebKit 26.5: iPhone 13 board 389→372, input bottom 664/664, no .room scroll; SE / 15 Pro Max unchanged (257 / 425). Chromium
  360×645 board 354 (unchanged), 390×844 389 (unchanged); doc scroll 0 everywhere. Real iPhone not verified.
