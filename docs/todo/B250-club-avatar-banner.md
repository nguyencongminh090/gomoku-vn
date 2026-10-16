# B250 — Club avatar + banner with image editors
**Status:** OPEN — built + browser-verified 2026-10-12, merged to dev d63fd25 (fe3f808); open only to check stash@{0} "250b banner standard size" for leftovers
**Area:** server/routes/clubs.js, ClubService, utils/club-image-store.js, db migration, client/js/club.js, clubs.js, avatar-crop.js
**From:** user request 2026-10-12   **Depends:** —

## Problem
Clubs only had a coloured tag tile; no photo identity.
## Scope
1. clubs.avatar_v/banner_v; files `server/data/club-images/<clubId>-<kind>.webp` (gitignored).
2. POST/DELETE/GET `/api/clubs/:slug/(avatar|banner)`; staff only; sharp re-encode (256², 1200×200).
3. AvatarCrop gets `aspect/outWidth/titleKey` (wide 6:1 editor); Manage tab has change/remove per image.
4. Show avatar on club page + clubs list/mine; banner above the club header.
## Don't
- Store uploads as-is; allow plain members; change user-avatar behaviour.
## Traps
- `write` middleware parses JSON (4 kb) — image routes use `write.slice(0,3)` + `express.raw`.
- CSP `img-src 'self' data:` — images are same-origin URLs, crop decodes via createImageBitmap.
## Done when
- clubs-images.test.js, avatar-crop + clubs-pages jsdom tests green; browser pass of upload→crop→show.
