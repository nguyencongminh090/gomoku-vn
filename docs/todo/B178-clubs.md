# B178 — Clubs (create/join/members/leaderboard)
**Status:** ✅ DONE 2026-10-09 (branch `feature/178-clubs`, uncommitted) — tables clubs/club_members, ClubService + `/api/clubs`, pages `clubs.html` (discover/create) and `/c/<slug>` (members leaderboard, manage), clubs on profile, lobby link, ?v=180. Tests: server/tests/clubs-route.test.js (+profile), client/tests/clubs-pages.test.js, clubs-list-page.test.js. NOT done: real-browser pass; club tournaments/chat/avatar; club-vs-club ranking ("Hạng CLB" in mockup); notifications for join requests.
**Area:** server/routes, client, schema
**From:** features/platform, 2026-10-09   **Depends:** B173, B175, planning Q5

## Problem
No groups of players.

## Scope
1. Tables clubs, club_members. 2. CRUD + roles. 3. Club page + leaderboard.

## Don't
- Start before Depends is done; details to be refined at pickup (re-read planning.md).

## Done when
- Backend tests; page matches mockup.

## Outcome (planning Q5, decided 2026-10-09)
- Any member can create; owner picks open|invite per club; max 500 members, 3 clubs per user (10 pending requests); roles owner/officer/member (+pending). Officers approve/reject and kick plain members, edit description; only the owner edits policy, sets roles, transfers (old owner → officer), deletes. Owner can't leave.
- Club leaderboard = members by rating in the chosen category (unrated last, any games count); avg rating counts only members with ≥ 20 ranked games. Club name uniqueness = unique slug.
