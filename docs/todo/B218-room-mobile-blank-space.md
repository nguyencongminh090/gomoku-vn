# B218 — Room mobile: blank space under the chat bar + page overscroll
**Status:** OPEN — fixed 2026-10-11 on ui/room-arena (uncommitted, with #216/#217), `?v=280`, awaiting user review on a real phone.
**Area:** client/css/room-arena.css (mobile block + root overscroll)
**From:** user 2026-10-11: "Review Room UI CSS for Layout… several blank space… Khi scroll, user có thể scroll quá tay để tạo ra khoảng trống… tập trung vào các lỗi tiềm năng trên Mobile."   **Depends:** #216, #217

## Problem
1. Expanded panel (min 360px) showed an empty band *below* the chat input (50px at 375×667); tall phones also in minimized state.
2. Page-level overscroll (iOS rubber-band, Android stretch / pull-to-refresh) reveals empty space above the nav / below the panel; pull-to-refresh reloads the room mid-game.
## Scope
1. Remove the legacy mobile `.chat-messages{max-height:180px}` (game.css, zen-era) for the arena room so messages fill the panel.
2. `overscroll-behavior: none` on the room's root scroller (html + body).
3. Bottom-align few chat messages next to the input (expanded panel top scrolls under the board).
## Don't
- Don't touch game.css (shared with tournament-match), the sticky stack, or panel min-heights (user decisions in #216/#217).
## Traps
- Viewport overscroll is read from `html`, not only `body` → `html:has(body.arena-room)`.
## Done when
- Real-browser pass 390×844 / 360×740 / 375×667 / 320×568: no gap between chat input and panel bottom; CSS guard test.
## Round 2 (2026-10-11 phone screenshots)
4. Document never scrolls on phones (`.room` is the scroller) so browser bars never auto-hide → gap stays constant; expanded panel fits the screen (min 200px). `?v=285`. Unverified: real keyboard.
## iOS check 2026-10-11 (Playwright WebKit 26.5, iPhone SE / 13 / 15 Pro Max emulation) — iPhone 13 overflow FIXED ?v=287 (board svh cap on all phones)
- iPhone 13 (390×664, Safari bars shown): minimized bar overflows 16px (input bottom 680 > 664, `.room` scrolls 16px; focus doesn't reveal it in emulation). Board 389 + cards + tiles 62 + bar 77 > viewport. Proposed: cap board height by `100svh − nav − 2·pcard − tiles − bar` (min 260px) on all phones, not only max-height:600.
- OK: :has/overflow:clip/dvh/overscroll/WAAPI supported; doc never scrolls; expand anim continuous, input inside panel every frame; sticky toggle at card bottom + tap minimizes; 0 console errors. SE gap 20px, 15 Pro Max 23px.
- Not testable here: touch swipe chaining (mobile WebKit has no wheel/touch-scroll API), keyboard, rubber-band, real Safari bars. Trap: WebKit applies CSP upgrade-insecure-requests on http://localhost (Chromium exempts it) — test copy needs `cspDirectives.upgradeInsecureRequests = null`.
## Touch / keyboard / overscroll check 2026-10-11 (Chromium, raw CDP touch events, 360×645 + 390×664, ?v=287)
- Chat swipe chaining OK: 11 swipes take chat 1002→0 (room stays), the NEXT swipe moves .room 123→26. Doc never scrolls, no reload on pull-down.
- FIXED ?v=288 (fix-log 2026-10-11-b218-keyboard-and-room-bounce): (1) keyboard simulated as resizes-content (viewport 645→355): input stays at y=499, hidden; stack released but nothing scrolls it into view. Proposed: on visualViewport resize while #chat-input focused → scrollIntoView({block:'end'}). (2) `.room{overscroll-behavior:contain}` still allows the local bounce/stretch inside .room on iOS/Android (blank band above the cards when pulling at the top) — proposed `none`. Visual bounce not renderable headless.
- Traps: `Input.synthesizeScrollGesture` touch does nothing headless (even a bare page) — use `Input.dispatchTouchEvent` start/move/end. Mobile WebKit has no touch scroll at all. No adb/emulator on this machine.
