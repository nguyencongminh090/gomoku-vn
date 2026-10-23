# B327 — Phone room: expanding the panel leaves the chat input below the fold
**Status:** ✅ FIXED 2026-10-23 (07ea191, merged 7c70408; closed on user's word "đã xong")
**Area:** client/js/room.js `setPanelMinimized` (~l.215-229), client/css/room-arena.css phone block (`.room` overflow)
**From:** ux-audit room.html, 2026-10-23 (`docs/audits/ux-audit-2026-10-23-room.md` M2, L1; evidence `docs/audits/2026-10-23-room/31b-375-panel-open.png`)   **Depends:** —

## Problem
At 375×812, tapping the 28 px triangle `#rpanel-toggle` shows tabs at y≈600 with an empty area; `#chat-input` sits at y=1308 (`.room` scrollHeight 1302). Only scrolling `.room` reaches it, and then board/clock/actions are off-screen. Same view shows touch targets under 44 px: `#btn-leave` 32×32, `#btn-send` 36×32, `#rpanel-toggle` 28 h, `#chat-input` 36 h.
## Scope
1. On expand, scroll `.rpanel` (or `#chat-input`) into view in the same function that already sets `chatMessages.scrollTop`.
2. Raise the four targets to ≥ 44 px on phones (padding/min-height only, no icon resize).
3. Real-browser pass at 375 and 320: expand, type, send, collapse; board stays visible after collapse.
## Don't
- Don't change the default minimized state (the board stays the focus).
- Don't touch desktop/tablet layouts.
## Traps
- `body` is `overflow:hidden` and `.room` scrolls, so `window.scrollTo` does nothing; scroll the inner container.
- Phone-room invariants live in project memory + `docs/knowledge/mobile-layout-zen-ui.md`; re-read before editing.
## Why this way
Smallest fix at the single toggle function; rejected: making the expanded panel a fixed full-height sheet (bigger redesign). Knowledge: `docs/knowledge/mobile-layout-zen-ui.md`.
## Done when
- After expanding at 375×812 the input is inside the viewport without scrolling.
- Targets ≥ 44 px measured; `npm test` green; cache-bust OK; fix-log entry.
