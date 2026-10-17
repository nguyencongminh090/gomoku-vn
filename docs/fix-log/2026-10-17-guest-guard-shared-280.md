# 2026-10-17 16:53 — #280 Shared guest guard on 7 member-only routes
## Prompt
Do #280 - 281.
## Root cause
Guards read `!req.user.userId`, but a guest session is `guest_…` + isGuest, so they never fired; the route tests mocked guests as userId:null, which hid it (same root as #273).
## Fix
New server/middleware/guest-guard.js (rejectGuests(message), isGuestUser) used by games report, forum, notifications, challenges, friends, clubs write, puzzles. /api/clubs/mine left open (guests call it on purpose).
## Verification
Route tests now mock a realistic guest (guest_abc + isGuest): 7 failures on the old guards, 0 on the new. guest-guard.test.js: unit + games report. Real browser (scratch DB): guest gets 403 GUEST_FORBIDDEN on all 6 routes (+ puzzles); a member gets 200. npm test 3339 pass.
