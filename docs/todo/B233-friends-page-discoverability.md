# B233 — Make the Bạn bè page discoverable for new users
**Status:** ✅ DONE 2026-10-12 (menu entry only; rest deferred below)
**Area:** client/js/platform-shell.js (account menu), i18n
**From:** user question 2026-10-12 "Phần Bạn bè có thể khó cho người mới biết cách truy cập?"   **Depends:** #198

## Problem
Only entries to social.html: bell panel footer, lobby "Thách đấu bạn bè", profile "Nhắn tin". Nothing in nav or account menu.
## Scope
1. Account-menu item "Bạn bè & tin nhắn" (chat-circle, per iconography registry) after Hồ sơ, members only. DONE.
## Don't
- No 7th nav tab / second icon button: Arena mockup has ONE social entry (the bell, `data-nav="social"`); nav tabs are text-only; mobile tab bar is full at 5 (needs design-workflow to change).
## Traps
- Bell panel footer "Mở trang Bạn bè & tin nhắn" already shows even when empty — no change needed.
## Deferred (not built)
- Mobile tab bar / "Tìm bạn" hint in lobby + empty friends list: needs a design decision.
