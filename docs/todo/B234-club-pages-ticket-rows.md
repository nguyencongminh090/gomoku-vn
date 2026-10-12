# B234 — Club pages violate the ticket-row rule
**Status:** ✅ FIXED 2026-10-12 (branch fix/234-club-ticket-rows)
**Area:** client/js/{club,clubs,platform-shell}.js, client/css/platform.css, club.html, clubs.html
**From:** user 2026-10-12 "Design of CLUB … vi phạm rule về ticket (padding), text a . b . c"   **Depends:** —

## Problem
Club/clubs rows were hairline `.prow` with 4px side padding and meta built as `a · b · c` strings.
## Scope
1. `PlatformShell.meta(parts)` → one `<span>` per fact. 2. `.prows--tickets` opt-in CSS (12px 16px, raised surface, 8px gap). 3. Apply to clubs list, events, staff, tournaments, pending; chat header and board title also de-joined.
## Don't
- Profile/social `.prow` untouched (shared class).
## Done when
- jsdom asserts spans and no `·`; `?v` bumped once.
