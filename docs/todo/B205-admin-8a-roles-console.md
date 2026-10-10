# B205 — R8 slice 8a: staff roles + /admin console (puzzle review + forum reports)
**Status:** OPEN — implemented on `feature/205-admin-roles`, uncommitted, awaiting review (real-browser pass pending)
**Area:** server (utils/roles.js, routes/admin.js, users.role, PuzzleService/ForumService gates, scripts/admin.js set-role) + client (admin.html/js, puzzles-review.js, forum-reports.js)
**From:** user 2026-10-10 "bắt đầu R8 Admin (gộp hàng chờ duyệt puzzle và báo cáo forum, thay cờ is_admin bằng role)"; scope chosen 8a   **Depends:** B203, B201

## Problem
Staff = bare `users.is_admin`; two queues live on their own pages (`/puzzles/review`, `/forum/reports`).

## Scope
1. `users.role` member|moderator|admin (inline migration, `is_admin=1` → admin once; `is_admin` column left dead). `utils/roles.js` `roleOf/can/permissionsOf`; permissions `puzzle.review`, `forum.moderate`, `admin.access` = moderator+admin.
2. Services call `roles.can`; `GET /api/admin/me` → `{role, permissions}`.
3. `/admin` page, tabs by permission (`#puzzles`, `#forum`); old URLs 301 to it; old standalone pages deleted.
4. CLI `set-role --username=<u> --role=…` replaces `set-admin`.

## Don't
- Not built (recorded in planning R8): cheat flags, avatar review, users tab (search / lock / change role in UI), audit log, review-queue paging beyond page 1.
- Admin-only vs moderator split is not used yet (no permission is admin-only) — add one when the users tab lands.

## Traps
- Client hides tabs only; each queue endpoint re-checks the permission server-side.
- Tab modules start lazily (BoardRenderer needs a visible canvas).
- `RoomManager.test.js` counts `broadcastRoomUpdate(io` sites — untouched.

## Done when
- Access matrix tests (member/moderator/admin/guest), migration test, jsdom shell test, real-browser pass as moderator + member.
