# B221 — Browser notification permission asked in context; Ctrl+K button removed
**Status:** ✅ DONE 2026-10-12 — merged to `dev` (c700f39). Tests: user-card-dm-ttl (7) + user-card jsdom; real-server pass incl. mobile 390 + light. Not verifiable headless: the real browser permission prompt.
**Area:** client/js/private-chat.js, client/index.html, client/css/lobby-zen.css, client/js/i18n.js
**From:** user 2026-10-12   **Depends:** B220

## Problem
"Bật thông báo" in the Ctrl+K modal was buried (never used) and, once granted/blocked, showed as a disabled button-looking line.
## Scope
1. `askNotifPermission()` — asks once, only while permission is `default`, on Message click in the profile card and on first send in a chat window (user gestures).
2. Removed the modal button, its CSS and `private_chat.notif_enable/enabled/blocked`.
## Don't
- Don't touch `showNotification` / title flash (still fire for DMs while the tab is hidden).
## Done when
- jsdom (4 tests in `client/tests/user-card.test.js`) + real-browser modal pass: done. Not verifiable headless: the real permission prompt.
