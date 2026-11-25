# B448 — `/api/clubs/mine` lacks color/tag: rail crest differs from the club's crest
**Status:** ✅ DONE 2026-11-25 — server merged to `dev` (c6d88922); real-browser check 2026-11-25: rail crest == list crest (`KDH` on red), shot `features/club-redesign/shots/impl/b448-discover-dark-1280.png`. Scope 3 (`listClubs` bannerUrl) not done (optional, ask first). Not deployed.
**Area:** `server/managers/ClubService.js` (`clubsOfUser`, maybe `listClubs`), `server/tests/`, `client/js/club-kit.js` (no change expected)
**From:** #446 real-browser pass 2026-11-24 (`features/club-redesign/shots/impl/discover-dark-1280.png`); user chose a separate todo   **Depends:** B446

## Problem
The club rail (both club pages) draws my clubs from `/api/clubs/mine`, which returns only slug/name/role/members/avatarUrl. A club without an avatar shows grey initials ("KỲ") in the rail but its tag on its colour ("KĐHG", teal) everywhere else: breaks hard rule 9 (one entity, same look).

## Scope
1. `clubsOfUser`: also select and return `color`, `tag` (same fields/fallbacks as `listClubs`).
2. Server test: `/mine` rows carry `color` + `tag` equal to the DB values.
3. Optional, ask first: `listClubs` returns `bannerUrl` so Khám phá featured cards show the real banner (today: generated pattern).
4. Real-browser check: rail crest == list crest for the same club.
## Don't
- Touch the rail rendering beyond passing the fields through (`ClubKit.renderRail` already uses `color`/`tag` when present).
## Done when
- Server test green, `npm test` green, shot shows matching crests.
