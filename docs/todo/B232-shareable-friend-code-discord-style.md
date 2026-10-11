# B232 — Shareable friend code (Discord-like `name#tag`)
**Status:** OPEN
**Area:** users schema (new `friend_tag`), FriendService.search/request, profile + settings UI
**From:** user, 2026-10-12 "ID để liên lạc có thể là mã hash từ tên? (cơ chế giống Discord)"   **Depends:** B231

## Problem
Username search (B231) works, but a short code that can be pasted in chat ("ann#4821") is exact-match only, so it can't be used to enumerate users.
## Scope
1. Decide format: per-user random 4-digit tag unique per display name, vs hash of username (hash of a public name is guessable → prefer random, stored).
2. Show it on own profile/settings with a copy button; accept `name#tag` in the B231 search box as an exact match.
## Don't
- Don't expose `users.id`. Don't make the tag the only way to find a user.
## Traps
- Tag changes when the display name changes? Pick one rule and test it. Needs a migration + backfill.
