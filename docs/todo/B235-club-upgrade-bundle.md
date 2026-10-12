# B235 — Club upgrade bundle (identity, announcement, invites, notifications, weekly board, challenge, history)
**Status:** ✅ DONE 2026-10-12 (branch fix/234-club-ticket-rows, uncommitted; server 8 + jsdom 9 tests; real-browser pass 1280/390 dark+light, invite→join, notifications, challenge button)
**Area:** server/db/{schema.sql,database.js}, server/managers/{ClubService,NotificationService}.js, server/routes/clubs.js, client/{club,clubs}.html, client/js/{club,clubs,platform-shell,i18n}.js, client/css/platform.css
**From:** user "Do all" after club UI review, 2026-10-12   **Depends:** #200, #198, #222

## Problem
Clubs have no identity, no way to invite, no outbound notifications, and a rating-only board.
## Scope
1. E identity: `clubs.color` (8 presets) + `clubs.tag` (2–4 chars) → coloured avatar on list + page; staff edit.
2. G announcement: `clubs.announcement` ≤280, staff edit, shown atop Tổng quan.
3. A invite: `club_invites`; staff invites by username → invitee joins directly even in an `invite` club; "Copy link" button.
4. D notifications: `club_invite`, `club_request` (→ staff), `club_approved`.
5. C weekly board: wins in the last 7 days among members (chip next to rating categories).
6. B member row "Thách đấu" → existing ChallengeModal (club.html loads challenge-modal.js).
7. H history: `club_log` (join/leave/kick/approve/role/transfer), staff-only list in Quản lý.
## Don't
- Team tournament (F) — #236. No new roles; `pending` stays the only non-member role.
## Traps
- `role != 'pending'` counts members everywhere: invites live in their own table, not as a role.
- Ticket rows: segments via `PlatformShell.meta`, lists get `.prows--tickets` (#234).
## Why this way
Own tables keep member counting/ranking queries untouched. Notifications reuse NotificationService (no new transport). docs/knowledge/ui-ux/ticket-rows.md for rows.
## Done when
- Server tests per feature + jsdom tests; real-browser pass (1280 + 390, dark/light); `?v` single value.
