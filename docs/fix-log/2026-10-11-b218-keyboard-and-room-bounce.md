# 2026-10-11 17:29 — #218 Room mobile: chat field hidden by the keyboard + .room still bounced
## Prompt
"do test: vuốt khung chat để kéo panel, bàn phím ảo, hiệu ứng nảy…" → findings; user: "okay, commit and write to memory".
## Root cause
1. Since the app-shell change the document never scrolls; with a keyboard that resizes the layout (simulated 645→355px) the
   focused input stayed at y=499 — the stack was released but nothing scrolled .room to it.
2. `.room{overscroll-behavior:contain}` blocks chaining only; the scroller's own bounce (iOS) / stretch (Android) remains →
   blank band above the cards when pulling at the top.
## Fix
room.js: visualViewport (fallback window) resize while #chat-input is focused → input bar scrollIntoView({block:'end'}).
room-arena.css: `.room{overscroll-behavior:none}`.
## Verification
- Tests: room-panel-minimize (+2 keyboard), room-arena-blank-space (.room none). Full npm test green. ?v=288.
- Chromium raw-touch run 360×645 / 390×664: keyboard sim → input 306–355/355 visible, send works, last message visible;
  chat chaining still OK (swipe 11 chat→0, swipe 12 room 123→27). Bounce itself not renderable headless; real keyboard unverified.
