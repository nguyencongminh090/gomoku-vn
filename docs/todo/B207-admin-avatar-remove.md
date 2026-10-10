# B207 — R8: staff can remove a user's avatar
**Status:** ✅ DONE 2026-10-10 — reviewed: admin-only (moderator DELETE → 403); real-browser: confirm dialog → `DELETE 200`, `avatar_v` → 0, block hidden, `avatar_remove` edge logged; idempotence (no avatar → no edge) covered in admin-users.test.js.
**Area:** server (utils/avatar-store.js, AdminUserService.removeAvatar, DELETE /api/admin/users/:id/avatar) + client (admin Users tab)
**From:** user 2026-10-10 "avatar không cần duyệt?" → chose post-moderation: "làm gỡ avatar"   **Depends:** B206

## Scope
Admin-only (`user.manage`) button on the Users tab: deletes the file, clears `avatar_v`, logs an `avatar_remove` edge actor→target. Idempotent (no avatar → no edge).

## Don't
- No pre-approval queue, no report button on profiles, no ban from re-uploading (recorded: user can upload again; lock the account for repeat offenders).
- Moderators cannot remove avatars (only admins have `user.manage`).

## Traps
- Avatar URLs are `immutable` cached by `?v=`; clearing sets v=0 so the URL disappears — a CDN-cached old URL can still serve until it expires.
- AVATAR_DIR moved to `utils/avatar-store.js`; tests set `process.env.AVATAR_DIR` before requiring.
