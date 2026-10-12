# 2026-10-12 07:13 — #234 Club pages violate the ticket-row rule
## Prompt
"Design of CLUB hiện tại đang vi phạm rule về ticket (padding for content inside ticket), text a . b . c (có thể thay bằng span hoặc tag)"
## Root cause
23f2ecc applied ticket rows to the home/forum pages only; club/clubs pages still used shared hairline `.prow` (4px side padding) and JS-joined meta strings (clubs.js row, club.js tournaments/chat/board title).
## Fix
`PlatformShell.meta(parts)` (one span per fact), `.prows--tickets` opt-in CSS in platform.css (profile/social `.prow` untouched), applied to clubs list, events, staff, tournaments, pending; chat header and board title de-joined. Branch fix/234-club-ticket-rows; ?v bumped.
## Verification
jsdom asserts spans, no "·", ticket class (clubs-pages, clubs-list-page). Real-browser pass 1280/390 dark+light via #235 pass. Not verified: other skins (zen/bento).
