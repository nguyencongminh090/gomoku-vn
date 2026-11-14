# B376 — Room nav N1 "Thẻ bàn": rules always visible + menu ≡
**Status:** OPEN
**Area:** client/room.html, client/js/room-ui.js, client/css/room-arena.css, client/js/i18n.js, client/tests/room-nav-rules.test.js
**From:** user 2026-11-14 "Hiển thị Luật chơi tường minh trong phòng" → picked A (nav), then N2, then switched to N1 (2026-11-14) → features/room-rules-display/mockups/nav.html   **Depends:** —

## Problem
Rules live only in the Settings tab; "Luật 1/Luật 2" names say nothing → players misread the rule. Nav is crowded (id, badge, QR, leave, gear, 6 links).
## Scope
1. Nav = brand · | · 2-line title: `#room-id-nav` (room name/code, click copies code) + `#btn-room-rules` line "mode icon+text · Luật 2 · Ô khoá ⓘ".
2. `#btn-room-rules` opens a rules popover (desktop) / bottom sheet (≤768px): one block per active rule (win rule, Ô khoá, Hố đen, Swap2) with a plain description; win rule gets a ✕/○ example.
3. Right: `#btn-leave` (desktop icon+text; phone ← at the far left, brand hidden) + `#btn-room-menu` ≡ → menu: QR (`#btn-room-qr`), copy invite link, Cài đặt (openSettingsPanel), "Đi tới" (`#room-site-links`, still hidden while seated in an ongoing game).
4. Phone dock `#btn-sheet` icon list → chat-circle (avoid two ≡).
## Don't
- No server change; rule text = GameEngine semantics (caro: only opponent stones block; wall/edge don't).
- Nav height unchanged (56/48 px); board/cards/panels must not move.
- Keep ids used by e2e/tests: #room-id-nav, #btn-leave, #btn-room-qr, #room-site-links, #room-mode-badge.
## Traps
- settings-panel.js mounts its gear into `.topnav__right` — room nav has none now; menu calls `window.openSettingsPanel`.
- Settings are locked while playing (RoomManager) → `roomData.settings` = current game's rules.
- Popover/menu must sit above the phone sheet/stage (z-index ≥ nav 1000).
## Why this way
User chose nav placement (0 px layout shift) and N2 (full rule text visible on phones, no "+1" truncation).
## Done when
- jsdom: rules line text per settings, popover blocks, menu toggle/escape, site links hidden rule kept; npm test green; cache-bust OK; browser pass 1440 + 390, light + dark.
- 2026-11-14 built on ui/room-nav-title (uncommitted): 19 new jsdom tests, npm test 3804/3804, cache-bust OK; browser pass (features/room-rules-display/live/pass.js, :3101 own DB) 1440/1024 light+dark, 390, 375×667: nav 56/48 px, board boxes unchanged, scrollW = innerWidth, 0 console errors. Server refuses wall/portal with Swap2, so the longest line is "Luật 2 · Ô khoá · Hố đen".
- 2026-11-14 switched to N1 (user): ticket [#code ⧉ | mode icon | rules ⓘ] centred, desktop Rời phòng + ≡; phones: short rules "Luật 2 +1", Rời phòng = last ≡ item (#btn-menu-leave clicks #btn-leave). e2e topnav-minimal-mobile updated for that (NOT run). 21 jsdom tests, npm test 3806/3806, cache-bust OK, browser pass re-run: same board boxes as N2, 0 console errors.
- 2026-11-14 user note: leave must stay on the bar → phones get an icon-only #btn-leave (menu leave item removed; e2e topnav-minimal-mobile back to "#btn-leave visible", still NOT run). ≤400px hides the ⓘ so "Tiêu chuẩn +1" fits at 375. npm test 3806/3806, browser pass 0 errors.
