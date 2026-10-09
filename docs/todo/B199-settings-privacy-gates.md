# B199 — R5: Settings page + privacy gates (country/city, who may DM/challenge/friend-request, hide online, badges, win streak)
**Status:** OPEN — todo only, not started (written 2026-10-09 from `dev` 7f74264)
**Area:** server (users migration, routes/profile.js, FriendService, ChallengeService, DmService, rankings) + client (new `settings.html`/`settings.js`, profile badges)
**From:** features/platform/planning.md § Release 2 (R5); B198 Decided #3 (privacy gate deferred here); B191 items 2–3   **Depends:** B198 (done)

## Problem
Mockup "Cài đặt — Hồ sơ & riêng tư" has no page: profile edits live in `settings-panel`/`profile.js`; only `hide_history`/`hide_bio` exist. R4 shipped with "everyone may DM/challenge/friend-request". No country/city, badges, or streak.

## Scope (slices, one branch each off dev, reviewed + merged separately)
1. **Schema + prefs API** — numbered migration (not schema.sql-only) adding to `users`: `country` (ISO-3166 alpha-2 or ''), `city` (≤40), `who_can_dm`, `who_can_challenge`, `who_can_friend` (`everyone|friends|nobody`; challenge/dm default `everyone`, friend default `everyone`), `hide_online` (0/1). Extend `PUT /api/profile` + `GET /api/profile/prefs` (validate enums; sanitize city like bio).
2. **Gates (server-side, authoritative)** — enforce in `DmService.send`, `ChallengeService.create`, `FriendService.request`: friends-only ⇒ must be accepted friends; nobody ⇒ refuse. New `err.*` codes (e.g. `DM_NOT_ALLOWED`, `CHALLENGE_NOT_ALLOWED`, `FRIEND_REQUEST_NOT_ALLOWED`) → vi+en i18n + `error-codes-i18n-consistency.test.js` SERVER_FILES. Client disables/explains the profile buttons from a `canDm/canChallenge/canFriend` flag on `GET /api/profile/:username`.
3. **Hide online** — one place decides presence shown to others (friends list, social page, profile); `hide_online` ⇒ shown offline to everyone except self. Verify where presence is exposed today before coding (grep `online` in routes/friends, social.js).
4. **Settings page** — `settings.html` + `settings.js` (Arena shell, socket-less, REST only): avatar, display name, bio, country/city, privacy toggles/selects, Save/Cancel. Nav "Tôi → Cài đặt". Fold in existing hideHistory/hideBio (don't duplicate the old panel's logic: reuse the same endpoint).
5. **Country/city surfaces** — profile header + rankings "Khu vực" column and scope Việt Nam (B191.2). Display only; no geo-IP.
6. **Badges + win streak** — computed on read from `games`/ratings (no stored badge table unless a query is too slow): Top 500, 1000 wins, etc.; current + best win streak on profile. Needs a Decided list of badges (Q below).

## Don't
- No block-list, no admin/reports (R8), no club chat (R6). Don't touch clock/room code or the one-socket rule (page stays REST-only).
- Don't gate only in the UI — a direct REST call must be refused too.
## Traps
- Guests have no prefs (members only), same as friends/DMs.
- Gate re-check at accept time for challenges/friend-accept if the target changed prefs in between? Decide: gate applies at **send** only; already-pending items stay valid.
- A user who sets `nobody` still receives replies in an existing DM thread? Decide in Q2 (default: gate applies per send, so replies from the other side are also gated by the recipient's own setting).
- `RoomManager.test.js` counts `broadcastRoomUpdate(io` sites (24) — don't add any.
- Bump `?v=N` everywhere; `node scripts/cache-bust.js` must print one value.
## Open questions (ask before slice 2/6)
1. Friends-only for DMs: do existing accepted friends only count, or also anyone I already have a thread with?
2. Final badge list + thresholds; is streak counted over rated games only?
3. Country list source: static ISO list in client (vi/en names) vs free text.
## Why this way
Server-side gates because REST/sockets are reachable without the UI; `hide_history`/`hide_bio` precedent (#177) = per-user columns on `users`. Knowledge: check `docs/knowledge/INDEX.md` privacy rows before slice 2.
## Done when
- Per slice: backend tests (each gate allow/deny, enum validation) + jsdom + real-browser pass (sandbox DB :3100, `playwright-e2e-safety`); `?v=N` bumped; fix-log/DONE entries.
