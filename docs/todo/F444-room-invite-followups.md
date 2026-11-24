# F444 — Room invite follow-ups (review minors of #443)
**Status:** ✅ DONE 2026-11-24 — backend jest (service +4), jsdom (room-invite +3, platform-shell +3, notify-toast 3), `npm test` 271 suites/4698 tests, real-browser pass 1280 (3 users, isolated DB): invite→lobby toast, focus trap, 10 s cooldown error survives search, decline→room-page toast, host-left→"hết hạn".
**Area:** server/managers/RoomInviteService.js, NotificationService.js, client/js/platform-shell.js, socket-client.js, room-invite.js, i18n.js
**From:** user 2026-11-24 "Approve" on the deferred minors list of #443   **Depends:** #443 (merged)

## Problem
Minors left by the #443 whole-branch review: stale invites from a departed host, bell re-render drops an in-flight Accept lock, same-target re-send spam, picker error wiped by search + no focus trap, no toast on receiving an invite, no "declined" notice for the host.

## Scope
1. `accept()`: INVITE_GONE (and drop) when the inviter is no longer in the room.
2. Re-send cooldown per sender→target (`RESEND_COOLDOWN_MS` 10 s → 429 `INVITE_TOO_SOON`).
3. platform-shell: per-invite state (busy / error / gone) survives re-renders; no focus loss on click.
4. Picker: persistent error line (`.rinv__err`, role=alert), Tab/Shift+Tab focus trap.
5. Invitee declines → `room_invite_declined` notification to the inviter (sender cancel / TTL expiry do not notify).
6. Live toast on `notify:new` for `room_invite` and `room_invite_declined`: `PlatformShell.toast` on shell pages, `window.showToast` on the room page.

## Don't
- No sound (no asset; `audio-manager` is game-only). No toast for other notification types.
- No change to seating / `room:join`; no new privacy column.

## Traps
- Toast CSS lives in main.css (loaded on every page); `showToast` exists only on the room page (chat-ui.js) — shell pages need their own small builder.
- Re-render on every click steals keyboard focus: only re-render when the request finishes.

## Why this way
Cooldown over counting re-sends toward the cap: the cap counts distinct targets, spam is repeated pushes to one. Persisted declined notice (not transient socket event) so an offline/other-page host still sees it in the bell.

## Done when
- Backend jest for 1, 2, 5; jsdom for 3, 4, 6; `npm test` green; real-browser pass (decline → host toast on room page; invite → toast on lobby).
