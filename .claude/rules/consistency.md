---
paths:
  - "client/js/**"
  - "client/css/**"
  - "server/routes/**"
  - "server/managers/**"
  - "server/socket/**"
  - "server/utils/*-store.js"
---

# Consistency — one entity, one source, same everywhere

The same entity (user avatar, club avatar/banner, display name, rating, badge…) must look and read
identically on every page and match the database + file store. Never a per-page variant.

## Display sync (avatar & co.)
- Render avatars ONLY via `window.PlatformShell.avatar(url, name, cls, opts)`. No hand-built `<img>`
  / initials / colour fallback in a page file.
- A new page or widget showing a user/club must reuse the same fields (`avatarUrl`, `displayName`) — add it
  to the shared payload builder, not a page-local query.
- Avatar URL = `/api/profile/avatar/<id>.webp?v=<avatar_v>`; club = `<clubId>-<kind>.webp` + `avatar_v`/`banner_v`.
  The `?v=` is the cache-buster: any change MUST bump it so every page refetches.
- Live pages (lobby, room, chat, friends) must update on avatar change, not only after reload.

## Data sync (DB ↔ files)
- Upload / replace / remove / staff-removal / account delete: DB column (`avatar_v`, `banner_v`) and the
  file (`avatar-store.js`, `club-image-store.js`) change in the same operation. No orphan file, no
  `_v` pointing at a missing file.
- Only the `*-store.js` helpers touch image paths. No `fs` image access elsewhere.

## Before finishing a change touching a shared entity
1. `grep -rn` the entity's field/URL across `client/js` and `server/` — list every place that shows or builds it.
2. Every place agrees (same field, same fallback, same size class intent).
3. Test: one assertion that the DB value and the served/displayed value match.

## Known duplication (don't fix unasked — record in `docs/todo/` if relevant)
Server builds the avatar URL string in several places (`SocketHandler.js`, `FriendService.js`,
`DmService.js`, `ClubService.js` imageUrl, `RoomManager` avatarLookup). Prefer extracting one helper
when you next touch any of them.
