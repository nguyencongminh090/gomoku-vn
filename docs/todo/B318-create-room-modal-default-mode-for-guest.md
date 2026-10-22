# B318 — Create-room modal preselects "Xếp hạng" for guests
**Status:** ✅ fixed 2026-10-22 (fix/318-modal-guest-default)
**Area:** client/index.html:235 (`#rm-rated … checked`), client/js/lobby.js (modal open handler)
**From:** ux-audit lobby mobile L2, 2026-10-22 (`docs/audits/2026-10-22/09-modal-filled.png`)   **Depends:** —

## Problem
Guests cannot play ranked, yet the modal opens with the "Xếp hạng" card selected; only a hint line
("Có khách ngồi chơi thì ván tự thành giao hữu") explains the outcome. Selected card contradicts the result.
## Scope
1. On modal open, if `GvnSession` user is a guest, check `#rm-friendly` (and uncheck rated); else keep rated default.
2. Keep the hint for logged-in users who invite a guest.
3. jsdom test: guest → friendly checked; user → rated checked.
## Don't
- Don't change server rules for guest rooms; don't disable the rated card (just default).
## Traps
- Modal may be re-opened after a prior selection; set default on each open, not once at init.
## Why this way
Matches quick-match card, which already says guests play friendly only. Rejected: hiding the rated card (users may log in mid-session). Knowledge: none.
## Done when
- Guest opens modal → "Giao hữu" selected; logged-in → "Xếp hạng".
- New jsdom test + `npm test` green; cache-bust OK.
