# B359 — Rename "Câu lạc bộ / CLB" → "Hội nhóm" site-wide (vi)
**Status:** ✅ DONE 2026-11-13 — vi text renamed (i18n.js, static html, server vi errors); leftovers = comments + *-mockup.html only
**Area:** client/js/i18n.js (vi strings: lobby.clubs, profile.clubs, clubs.*, tournaments.*club*, err.*club*), nav/tab bar labels (platform-shell.js), client/*.html static fallback text, tests asserting the old text
**From:** user 2026-11-12 (home redesign: "CLB -> Hội nhóm"; scope = toàn site)   **Depends:** —

## Problem
User wants the clubs feature called "Hội nhóm". One entity = one name (consistency rule), so every Vietnamese label changes together.

## Scope
1. List every vi string with "Câu lạc bộ" / "CLB" (`grep -n` i18n.js + client/*.html + client/js/*.js literals); replace with "Hội nhóm" / "nhóm" keeping grammar ("Tạo CLB" → "Tạo nhóm", "CLB của tôi" → "Nhóm của tôi", "Rời CLB" → "Rời nhóm").
2. Update tests that assert old text; cache-bust --write.

## Don't
- No URL/route/DB/API rename (/clubs, club_id, clubSlug stay). English strings stay "Clubs".

## Traps
- Admin/club log strings are stored as templates in i18n, not in the DB — check `club_log` rows don't store rendered text.

## Why this way
Text-only rename keeps links and data stable. Rejected: home-only rename (two names for one thing).

## Done when
- `grep -rn "Câu lạc bộ\|CLB" client/ --include=*.js --include=*.html` returns only intentional leftovers (listed here); `npm test` green; cache-bust OK.
