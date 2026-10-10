# B177 — User profile page + avatar upload
**Status:** ✅ DONE 2026-10-09 (branch `feature/177-profile-avatar`, uncommitted) — `/u/:username` page + `/api/profile` (read, PUT bio/privacy, avatar POST/DELETE/GET), users.bio/avatar_v/hide_history/hide_bio migration, sharp re-encode, rankings rows link to profiles, ?v=179. Tests: server/tests/profile-route.test.js, client/tests/profile-page.test.js. NOT done: real-browser pass; users.ui_skin (#180); display-name edit.
**Area:** server/routes, client, storage
**From:** features/platform, 2026-10-09   **Depends:** B173, B174, planning Q2/Q6

## Problem
No public profile or images.

## Scope
1. Profile columns + migration. 2. /u/:name page. 3. Avatar upload (validate type/size, re-encode). 4. Edit/privacy.

## Don't
- Start before Depends is done; details to be refined at pickup (re-read planning.md).

## Done when
- Upload safety tests; page matches mockup.

## Outcome
- Planning Q2: **local disk** `server/data/avatars/<userId>.webp` (gitignored, `AVATAR_DIR` override); upload ≤ 2 MB JPEG/PNG/WebP only (SVG rejected), decoded+re-encoded 256² WebP q70→25 until ≤ 30 KB (~6–12 KB typical), EXIF dropped, one file per user overwritten. New dep: `sharp`.
- Planning Q6: **public with opt-outs** — hide_history hides stats+recent games, hide_bio hides bio; owner always sees own.
- Stats count only games whose `winner` is normalised BLACK/WHITE/draw (legacy raw-id winners count as games, not wins).
