# 2026-10-11 10:28 — #218 Room mobile: blank band under the chat bar + page overscroll gap
## Prompt
"Review Room UI: Review CSS for Layout. Issue: Currently there are several blank space. Khi scroll, user có thể scroll quá tay để tạo ra khoảng trống… tập trung vào các lỗi tiềm năng trên Mobile."
## Root cause
1. game.css (shared, zen-era) caps phone `.chat-messages` at `max-height:180px`. In the arena room the panel is
   `flex:1` (min 360px expanded) and `.chat-panel{height:100%}`, so everything past messages(180)+input stayed
   empty *below* the input: 50px at 375×667 expanded; minimized too once leftover height > ~265px (430×932).
2. Expanded chat was top-aligned: with the sticky stack the panel top scrolls under the board, so the visible
   strip above the input was empty while the few messages sat hidden.
3. No `overscroll-behavior` on the root → iOS rubber-band / Android stretch + pull-to-refresh past nav/panel
   (and a pull-to-refresh reloads the room mid-game).
## Fix
room-arena.css only: phone block `body.arena-room .chat-messages{max-height:none;min-height:0}` +
`> :first-child{margin-top:auto}` (bottom-align, keeps scroll-back unlike justify-content:flex-end);
`html:has(body.arena-room), body.arena-room{overscroll-behavior:none}`. game.css untouched (tournament-match).
## Verification
- Test: client/tests/room-arena-blank-space.test.js (4). Full `npm test` 2836 green. `?v=280`.
- Real browser (scratchpad server, matchmade room, Chromium mobile): gap panel-bottom↔input-bottom 0 px at
  390×844, 360×740, 375×667, 320×568, 430×932, both panel states (before: 50 px at 375×667 expanded);
  html overscroll-behavior = none; no horizontal scroll.
- Not verified: real iOS Safari / Android bounce + pull-to-refresh (headless can't overscroll).
