# B211 — Settings as a platform page (replaces the nav gear)
**Status:** OPEN — decision recorded, design not started
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
