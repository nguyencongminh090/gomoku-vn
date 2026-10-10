# B211 — Settings as a platform page (replaces the nav gear)
**Status:** ✅ DONE 2026-10-10 — on `ui/settings-page` (uncommitted, ?v=234), awaiting user review + "commit and merge to dev". Evidence below; `npm test` 135 suites / 2644; real-browser pass member+guest, 1280+390, dark.
**Area:** client/settings.html + js/settings*.js, js/settings-panel.js (gear panel), js/platform-shell.js (entry point)
**From:** user 2026-10-10 "It's settings. It seems current design don't have settings tab for user to setup their own UI? The old site used small settings button because of not much item to configure. Now we have a platform so I think we should consider Setting tab."   **Depends:** B209

## Problem
Two disjoint settings surfaces: the gear panel (language, skin Arena/Zen/Bento, light/dark, density, display mode, click mode, account/logout) and `/settings.html` ("Hồ sơ & riêng tư": avatar, bio, country/city, privacy, who-can-DM/challenge/friend). Neither is a discoverable "Settings" place; the mockup nav has no gear.

## Scope (proposal — confirm before building; size M, design via `design-workflow`)
1. One Settings page with underline tabs, e.g. Hồ sơ & riêng tư | Giao diện (skin, light/dark, density, display mode, language) | Trò chơi (click mode, sound) | Tài khoản (logout, create account for guests).
2. Entry point: user-chip menu (Hồ sơ, Cài đặt, Quản trị for staff, Đăng xuất) and/or a footer link, as in the mockup footer. Nav then = mode toggle + bell + user chip.
3. The gear panel stays only on the room page (in-game quick settings) if still wanted there.

## Don't
- Don't remove the gear from the nav before this page exists. Don't add settings that need new backend in this slice.

## Traps
- `settings-panel.js` needs `session.js`; the room page loads it differently (BoardRenderer/zen) — keep room quick-settings working.
- Guests have no profile settings: Giao diện/Trò chơi tabs must work for them.

## Done when
- Page matches the Arena settings mockup width (520–720px card) per tab; real-browser pass desktop+mobile, dark+light, member+guest.

## Built (2026-10-10, user-approved brief: 1 direction, 4 tabs, chip menu)
- `/settings.html`: underline tabs Hồ sơ | Giao diện | Trò chơi | Tài khoản (`settings-page.js`; profile form stays `settings.js`). Guests: no Hồ sơ tab, never call the profile API. `#game` etc. deep-link.
- Icon-first segmented controls (sun/moon, density, click mode…) carry aria-label+title; ~24 glyphs added to `phosphor-sprite.svg` (from @phosphor-icons/core 2.1.1).
- Nav: gear removed; chip is a menu (Hồ sơ · Cài đặt · Quản trị if `admin.access` · Đăng xuất); guests get a chip too (Cài đặt · Tạo tài khoản). Room page keeps its in-game gear panel (`GvnSettings` exports shared accessors).
## Not done / decided against
- Footer "Cài đặt" link from the mockup: skipped (real pages have no footer; chip menu is the entry). Signed-out visitors (no session) lose the gear → only the mode toggle + Đăng nhập in the nav.
- Not checked: light-mode screenshots of the real page, Firefox/WebKit, sticky Lưu bar on short viewports, the old gear panel on non-room pages is now unreachable (script still loaded there).
- Follow-ups folded in (user 2026-10-10): nav chip loads the avatar (`/api/rankings/me` now returns `avatarUrl`; root cause: chip only drew initials, client lacked `avatar_v`); avatar editor `js/avatar-crop.js` (modal: drag, wheel/slider zoom 1–4×, keyboard, circle mask, canvas crop → 512² webp → existing POST /api/profile/avatar, server unchanged). Trap: CSP `img-src 'self' data:` blocks `blob:` → decode with `createImageBitmap(file)`, fallback FileReader data: URL. Nav chip now follows an avatar change at once (`PlatformShell.setMyAvatar`; fix-log 2026-10-10-b211-nav-chip-avatar). Not done: pinch-zoom on touch (slider/wheel only); rotate.
