# B250 — Club avatar + banner with image editors
**Status:** OPEN — #250 merged to dev d63fd25; 250b (banner 4:1, 1920×480) BUILT 2026-10-16 on feature/250b-club-banner-standard-size (uncommitted, ?v=386, browser pass done 2026-10-16 (Chromium desktop + 390px: upload→crop→save→show, served 1920×480 webp, no console errors; fixed stale "6:1" hint in i18n)), drop stash@{0} after merge
**Area:** server/routes/clubs.js, ClubService, utils/club-image-store.js, db migration, client/js/club.js, clubs.js, avatar-crop.js
**From:** user request 2026-10-12   **Depends:** —

## Problem
Clubs only had a coloured tag tile; no photo identity.
## Scope
1. clubs.avatar_v/banner_v; files `server/data/club-images/<clubId>-<kind>.webp` (gitignored).
2. POST/DELETE/GET `/api/clubs/:slug/(avatar|banner)`; staff only; sharp re-encode (256², 1920×480).
3. AvatarCrop gets `aspect/outWidth/titleKey` (wide 4:1 editor); Manage tab has change/remove per image.
4. Show avatar on club page + clubs list/mine; banner above the club header.
## Don't
- Store uploads as-is; allow plain members; change user-avatar behaviour.
## Traps
- `write` middleware parses JSON (4 kb) — image routes use `write.slice(0,3)` + `express.raw`.
- CSP `img-src 'self' data:` — images are same-origin URLs, crop decodes via createImageBitmap.
## Done when
- clubs-images.test.js, avatar-crop + clubs-pages jsdom tests green; browser pass of upload→crop→show.
