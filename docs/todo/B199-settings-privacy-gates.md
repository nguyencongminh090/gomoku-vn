# B199 — R5: Settings page + privacy gates (country/city, who may DM/challenge/friend-request, hide online, badges, win streak)
**Status:** ✅ DONE 2026-10-10 — all 6 slices merged on `dev` (`?v=204`), closed by user after review. Real-server browser pass done 2026-10-10 (copy on :3100, own DB, UI login): settings save/persist, DM/challenge/friend gates (REST 403 + hidden buttons), hide-online (absent from lobby list, live re-broadcast on unhide), profile city, rankings `scope=vn` — 14/14 checks, 0 console errors. Not covered: socket-path DM refusal in a browser (unit-tested only), avatar upload on settings, mobile width on the real server, migration on a populated old DB.
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
- DM gate is per send and applies to both sides: a reply is gated by the recipient's own setting.
- `RoomManager.test.js` counts `broadcastRoomUpdate(io` sites (24) — don't add any.
- Bump `?v=N` everywhere; `node scripts/cache-bust.js` must print one value.
## Decided (user, 2026-10-09)
1. "Friends only" DM = accepted friends only; an old thread with a non-friend cannot be continued.
2. Badges (Top 500, 1000 wins, …) and win streak count **rated games only**.
3. Country = static ISO-3166 list in the client (vi/en names), stored as alpha-2.
## Why this way
Server-side gates because REST/sockets are reachable without the UI; `hide_history`/`hide_bio` precedent (#177) = per-user columns on `users`. Knowledge: check `docs/knowledge/INDEX.md` privacy rows before slice 2.
## Done when
- Per slice: backend tests (each gate allow/deny, enum validation) + jsdom + real-browser pass (sandbox DB :3100, `playwright-e2e-safety`); `?v=N` bumped; fix-log/DONE entries.
## Slice 1 notes (2026-10-09, `feature/199-settings-privacy`)
- Columns added by the inline `PRAGMA table_info` migration in `database.js` (the #177/#180 pattern), not a numbered SQL file. `country` is only format-checked (`^[A-Z]{2}$`); the ISO list lives in the client (slice 4).
- `PUT /api/profile` + `GET /api/profile/prefs` + self-only `privacy` on `GET /api/profile/:username`; new codes `COUNTRY_INVALID`, `CITY_INVALID`, `AUDIENCE_INVALID`. Gates are stored but not enforced yet (slice 2).
- Tests: `profile-route.test.js` (+1); full `npm test` 2298 green. Not tested: migration on a populated pre-existing DB.
## Slice 2 notes (2026-10-09, `feature/199-gates`)
- `managers/PrivacyGate.allowed(from, to, 'dm'|'challenge'|'friend')` (lazy-requires FriendService: circular). Enforced in `DmService.send`, DM socket path (`DM_NOT_ALLOWED`, i18n `err.dm_not_allowed`), `ChallengeService.send` (`CHALLENGE_NOT_ALLOWED`), `FriendService.request` (`FRIEND_REQUEST_NOT_ALLOWED`; only a NEW request is gated, a crossed one still completes; `friends` acts as `nobody` for friend requests).
- `GET /api/profile/:username` → `can {dm,challenge,friend}` for member viewers (not self/anonymous); profile.js hides the buttons and shows a note. Tests: `privacy-gates.test.js` (13) + profile-route (+1). `?v=201`.
- Not covered: jsdom for the profile.js `can` branch; real-browser pass (do together with slice 4 settings page).
## Slice 3 notes (2026-10-09, `feature/199-hide-online`)
- Presence is only exposed via the lobby online list (`lobby:online_users`), not REST. `state.setHideOnline(userId, bool)` keeps an in-memory `hiddenOnline` set (loaded at socket connect, updated live by `PUT /api/profile`, re-broadcasts the list); `getOnlineUsersList` skips them. Hidden users stay connected and fully functional; they also no longer see themselves in the list.
- Not hidden: room membership/spectator lists and a hidden user's own DM live-push (they are delivered normally). Tests: state-online-users (+1), profile-route (+assert).
## Slice 4 notes (2026-10-09, `feature/199-settings-page`)
- `client/settings.html` + `js/settings.js` + `js/countries.js` (ISO alpha-2 codes; names from `Intl.DisplayNames` in the UI language). REST only. Friend-request audience offers everyone/nobody only. Registered in `vite.config.js`.
- The old in-page edit panel on `/u/<name>` was removed; "Chỉnh sửa" now links to `/settings.html`. Display-name editing is NOT included (no endpoint exists; needs uniqueness/profanity rules — separate item if wanted).
- Tests: `settings-page.test.js` (6), profile-page (+can, edit link). `?v=202`. Real-browser pass: see end-of-#199 note.
## Slice 5 notes (2026-10-09, `feature/199-location`)
- `GET /api/rankings?scope=vn` (public, cached per key, ranks within the country, `q` ignored) + `country`/`city` on every row; chip "Việt Nam" for everyone; table column "Khu vực" (city, country name via `Intl.DisplayNames`). Profile header shows "joined · city, country". `GET /api/profile/:username` now includes `country`/`city` publicly (the user opted in by setting them).
- Tests: rankings-route (+4), rankings-page (+2, 2 adapted for the new chip order), profile-page (+1). `?v=203`.
## Slice 6 notes (2026-10-09, `feature/199-badges`)
- `managers/Achievements.js` (pure): badges `first_win`, `wins_100`, `wins_1000` (rated wins), `top_500`, `top_10` (best rank over all categories; listed from `ratings`' `rank`), streak over the newest 1000 finished RATED games (loss or draw ends it). Computed on every `GET /api/profile/:username`: +2 cheap queries. Win-based badges + streak follow `hide_history` (null/hidden for others); rank badges are public.
- Client: badge pills (`#pf-badges`) + "Chuỗi thắng" in the stats row. Tests: achievements (21), profile-route (+3), profile-page (+1). `?v=204`.
