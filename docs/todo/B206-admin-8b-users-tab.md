# B206 — R8 slice 8b: /admin Users tab (find, change role, lock) + change graph
**Status:** OPEN — implemented on `feature/206-admin-users`, uncommitted, awaiting review
**Area:** server (admin_edges table, users.locked_at, AdminUserService, /api/admin/users*, auth lock checks, `user.manage` admin-only) + client (admin.html tab, admin-users.js)
**From:** user 2026-10-10 "Làm tiếp tab quản lý người dùng. Tôi đề xuất Graph base, tổ chức các thay đổi của người dùng thành đồ thị graph." (answer: change log as a graph)   **Depends:** B205

## Problem
Roles are only granted via sqlite3/CLI; no way to find a user, lock an account, or see who changed what.

## Scope
1. `admin_edges(id, actor_id, action, target_id, detail JSON, created_at)` = directed edge actor→target labelled `role_set`/`lock`/`unlock`. No FK (history outlives deleted users). SQLite, no graph DB.
2. `users.locked_at` (inline migration). Lock revokes sessions; password login (after a correct password) and Google login refuse locked accounts.
3. API (admin only, perm `user.manage`): `GET /api/admin/users?q=&page=`, `GET /users/:id` (user + 1-hop edges + neighbour nodes), `POST /users/:id/role {role}`, `POST /users/:id/lock {locked, reason}`.
4. Tab `#users`: search, list, detail (role select, lock/unlock, history, SVG radial graph).

## Don't
- No cheat flags / avatar review (later R8). Moderators cannot see the tab. No graph library (hand-rolled SVG, ≤ 50 edges).
- Rules: cannot change/lock yourself; cannot lock an admin (demote first); lock needs a reason (≤ 200).

## Traps
- A live socket survived a lock (sessions revoked, socket not kicked) — fixed 2026-10-10, see fix-log 2026-10-10-b206-lock-kicks-live-socket.
- LIKE wildcards in `q` must be escaped. Render names with `textContent`/SVG `<title>`.
- Locked-account message must not reveal lock before password check (no account probing).
