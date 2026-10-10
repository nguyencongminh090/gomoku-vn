# 2026-10-10 15:34 — #211 nav user chip never showed the avatar
## Prompt
"The nav bar not load user avatar?" / "Ngay sau khi lưu hồ sơ, avatar on nav should update instantly?"
## Root cause
Chip drew initials only. The client knows userId but not `users.avatar_v`, so it could not build `/api/profile/avatar/<id>.webp?v=<n>`; `/api/rankings/me` (already fetched by the shell) did not return it. After an upload/remove the chip had no way to learn the change either.
## Fix
server/routes/rankings.js: `/me` returns `avatarUrl` (null without avatar; same URL shape as profile.js). client/js/platform-shell.js: `setMyAvatar(url)` (chip falls back to initials), called from /me and exported; client/js/settings.js: `avatarChanged()` calls it after upload/remove. Branch ui/settings-page, ?v=234. Left alone: profile.js `avatarUrl`, other pages' avatars.
## Verification
Tests kept: server rankings-route (avatarUrl set/unset), client platform-shell (initials → image → initials, no-op without chip), settings-page (upload calls setMyAvatar). npm test 135 suites / 2644. Real browser (own-DB copy, :3100): chip image after upload and initials after remove, no reload. Not verified: Firefox/WebKit; other pages after avatar change in another tab.
