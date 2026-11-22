# F418 — Home (phone) redesign "hero photo" from mobile template
**Status:** ✅ DONE 2026-11-22 — merged to dev (95f3e348), deployed prod; real-phone check not done
**Area:** client/index.html (#screen-home), client/js/lobby-home.js, client/css/home-hero.css (new), client/assets/photos/home-hero-*.webp, client/assets/icons/phosphor-sprite.svg, client/i18n.js
**From:** user 2026-11-18 "Redesign Homepage" + mobile_template.png + pexels-archudio-38833008.jpg; mockup features/home-hero-photo/   **Depends:** —

## Problem
User wants the phone home to follow the template: photo hero, big amber Chơi nhanh, option chips, 3 counts, live-games strip, news card.
## Scope
1. ≤860px only; desktop (#366 "Bảng quán cờ") unchanged.
2. Hero = Pexels photo (CSS background, phone-only so desktop never downloads it) + gradient; transparent shell nav over it on home only (`body.is-home`).
3. "Play3CR" + slogan "Kết nối đam mê, thách thức trí tuệ"; #qm-play restyled amber; chips Luật/Thời gian/Chế độ open the existing #qm-pick bottom sheet.
4. Stats online/searching/playing from /api/home `stats`; "Đang diễn ra" = `live` (≤3) cards, decorative mini board, viewers; "Xem tất cả" → #rooms.
5. News card = existing `news` (1 item) + date.
6. Phone hides: sentence, Thách đấu, room code form, tiles, my-game card, greeting, pulse line (user chose "Bỏ hết, theo đúng template").
## Don't
- No server/ changes (thumbnails with real stones + more news = F419). No board.js.
## Traps
- `blankBtn()` focus return must target the visible control (chip on phone, blank on desktop).
- Lower-case mid-sentence blank labels ("xếp hạng") need a capitalised chip label.
## Why this way
Reuses #qm-play/#qm-search/#qm-pick so quick-match logic stays single-source; new DOM only for chips/stats/live. Notes: docs/knowledge/ui-ux (contrast over photo → scrim).
## Done when
- jsdom tests for chips/stats/live render; npm test green; cache-bust OK; real-browser phone pass light/dark 390+360, desktop unchanged.
## Result 2026-11-18
- Tests: lobby-home.test.js +11 (#418 block, i18n no-duplicate-key guard); npm test 246 suites green.
- Browser pass: features/home-hero-photo/pass.js (isolated :3101, needs CORS_ORIGIN=http://localhost:3101 — .env origin list rejects localhost sockets); shots/built-*.png; 0 console errors, no h-scroll at 360/390, desktop bg none.
- Trap hit: `home.live_vs` already existed ('{a} vs {b}', later in the block) → renamed to `home.live_vs_word`.
- Tab bar (user 2026-11-18 "okay"): active item amber site-wide via `--c-tab-on` (tokens.css; dark #ffc865 12:1, light #a85600 ≥4.5:1 — template #f5a623 is ~2:1 on white), test covers every skin bg.
