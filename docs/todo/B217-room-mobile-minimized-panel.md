# B217 — Room mobile: minimizable bottom panel (actions + quick chat bar)
**Status:** ✅ CLOSED 2026-10-12 — closed by user request without review/merge; state at close: implemented 2026-10-11 on ui/room-arena (uncommitted), awaiting user review. Default minimized; choice in localStorage `gvn_room_panel_min`; no unread dot (not built).
**Area:** client/css/room-arena.css (mobile block), client/js/room-ui.js, client/room.html, i18n
**From:** user 2026-10-11 (suggestion, after #216 sticky board): "phần panel dưới chỉ hiện chức năng như (cầu hòa/đầu hàng) + thanh chatbar rút gọn (không có khung tin nhắn, chỉ có khung nhập (quick chat bar) + một mũi tên tam giác lên để expand (show toàn bộ), nếu minimize thì rút gọn display lại."   **Depends:** #216

## Problem
Under the sticky board stack, short phones have ~140–170px left; the full tab panel (Moves/Chat/Spectators/Settings) cannot fit.
## Scope
1. Mobile (≤768px) panel has two states: **minimized** (action tiles e.g. Draw/Resign + a one-line chat input bar + ▲ expand toggle) and **expanded** (today's tabs + messages, toggle becomes ▼).
2. Persist the choice (localStorage) — default to decide with the user.
3. Chat input focus should not break the sticky stack release rule (`:has(#chat-input:focus)`).
## Don't
- Don't change desktop layout or wire events; no helper text (see #216 Don't).
## Traps
- Minimized bar must stay above the OS keyboard; toggle needs ≥44px target + aria-expanded.
- Unread chat in minimized state needs a quiet indicator (open question).
## Done when
- Real-browser pass at 390×844 / 375×667 / 320×568 both states; jsdom test for the toggle.
## Change 2026-10-11 (user: "At minimize, only show quick chat bar… không để khung chat"; "minimize và expand cần mượt hơn")
- Minimized = ▲ + input only (`.chat-messages` hidden), panel docked at the bottom (`margin-top:auto`); replaces "latest lines fill the leftover". Tall phones: leftover (~170px at 390×844) sits between tiles and bar.
- `room.js animatePanelSwitch`: FLIP on flex-basis+min/max-height, 240ms, content pinned bottom (input never leaves the panel — sampled every frame at 390×844/375×667/320×568), lines fade, arrow follows `aria-expanded`; off for reduced motion/desktop. Tests: room-panel-minimize (8). `?v=283`.
- 2026-10-11 (user): chat/moves lists chain scroll into `.room` (no `overscroll-behavior:contain`) so a swipe past the chat start moves the panel down; ▲/▼ toggle `position:sticky` under my card (`.rpanel{overflow:clip}` — hidden would be its scroll container). Verified 360×645/375×667 with 25 messages. `?v=286`.
- 2026-10-11 (user): expanded releases the sticky stack (page scrolls; panel ≥ screen tall; ▼ bar sticks at top:0) for longer chat/easier Settings; minimized re-pins. CSS-only via `:has(#rpanel-toggle[aria-expanded="true"])`; ?v=295. Not browser-verified.
