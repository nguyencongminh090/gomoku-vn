# B214 — Icon system for platform pages (size scale, labels, meaning) + apply to Settings/shell/profile
**Status:** OPEN — built 2026-10-10 on `ui/icon-system` (`?v=259`), awaiting review
**Area:** client/css/platform.css, client/css/platform-shell.css, client/settings.html, client/js/settings-page.js, phosphor-sprite.svg, docs/knowledge/ui-ux/iconography.md
**From:** user 2026-10-10 "một số Icon quá nhỏ, icon chưa phù hợp với nội dung, chưa chuyên nghiệp … search/dùng skills/knowledge để phân tích và quyết định"   **Depends:** #212, #213

## Problem
~10 icon sizes in CSS (11–28px; `1em` icons = 11px beside Settings field labels, 13px in buttons/caret); Settings Hồ sơ tab uses
11px icons + uppercase 11px labels while the other 3 tabs use 20px icons + 14px labels; country and city share map-pin;
"Trò chơi" = game-controller (console metaphor); density options are icon-only (rows / list-dashes: meaning unguessable);
theme row icon = option icon (sun twice); Settings tabs icon-only on mobile (13px-wide targets); Xoá ảnh / Huỷ / Xem hồ sơ lack icons.
## Scope
1. Decision note `docs/knowledge/ui-ux/iconography.md` (registry + rules), registered in ui-ux INDEX.
2. Tokens `--icon-sm/md/lg` (16/20/24) on `.pl`; buttons/badges/meta 16 site-wide on platform pages; menu items, segment icons 20; tab bar 24; chip caret 16.
3. Settings: field labels = 20px icon + 14px/600 sentence case (same as rows); country → globe; game tab → grid-four; theme row → circle-half;
   density options text; tabs show labels on mobile; Xoá ảnh trash, Huỷ arrow-counter-clockwise, Xem hồ sơ eye; Riêng tư section separated.
## Scope 2 (added 2026-10-10, not built)
User: "tôi cần bộ Icon hiện đại, phù hợp nội dung cho toàn bộ website" (in addition to sizes).
- Whole site, not only platform pages: lobby (index), room, replay, tournament(-match), diag, admin, club(s), forum(-thread),
  login/oauth, puzzle(s)/editor, social. Survey: emoji as icons in index.html (3), tournament.html (6) and 10 JS files
  (chat-ui, game-ui, replay, replay-report, private-chat, puzzles, puzzle-editor, room-socket, room-ui, i18n); several pages
  (admin, club, forum, login, puzzles, social) use no sprite icon at all.
- Decide by research first (memory: design decisions by research): keep Phosphor Regular (already modern, 1 set) vs another
  set; check each concept fits content (5-second rule) and extend the registry in iconography.md; apply 16/20/24 scale site-wide.
- Mockup HTML files (*-mockup.html) out of scope.
- Plan (2026-10-10, measured 16 pages): stay on Phosphor (one set; switching = churn, no gain). (a) glyphs → sprite: ✕ close (index×3,
  tournament×6, PM window, room stand-up) x; puzzle answer delete trash; ← back links arrow-left; crop ↺↻ arrow-arc-*;
  puzzle ✓/🎉 check-circle; i18n 🔊🔇 dropped. (b) sizes: lobby/tournament/room 12–15px → 16, 18 → 20. (c) leading
  icons on main actions only: create (forum/clubs/puzzles) plus-circle, Gửi duyệt paper-plane-tilt, Tìm phòng magnifying-glass,
  puzzle tools circle/fill-circle/eraser/target. Kept as text: ⚠ in chat system lines (text + toast detection), 💬 in
  document.title, ✕/○ replay names (X/O piece symbols), room ▶ turn marker (9px column, #143), filter chips (rule/time/difficulty/tags).
## Don't
- (Scope 1 only) Lobby/room/tournament/diag CSS — now covered by Scope 2. Mobile save bar hidden under tab bar = bug → own fix item.
## Done when
- jsdom/static asserts (no platform icon < 16px rule, registry icons used, tab labels visible); `npm test`; real-browser re-measure Settings 1280/390.
## Result
Sources: NN/g Icon Usability, Material system icons, WCAG 2.2 SC 2.5.8 (verified at w3.org); SKILLS_TREE has no icon note.
Rendered icons on 9 platform pages × 1280/390: sizes {16:134, 20:44, 24:45}, none < 16px, 0 console errors.
Also: language row → translate (globe = country). 4 new tests fail on old code; `npm test` 2746. Not done: lobby/room/tournament/diag CSS (≈15 more sizes), #215 save bar.
Reviews 1–2 (Settings): appearance paint-brush, game tab sliders-horizontal, bio quotes; tabs 20/14px (16+12px gap ≤400px); nav icons 20; Riêng tư sentence case + toggle icons; challenge boxing-glove. Commits fa89448, a3e030c.
Scope 2 built: glyph→sprite (✕ ×10, ← ×3, ↺↻, ✓, 🎉/🔊🔇 dropped, + Thêm), legacy 12–15/18px → 16/20, plus-circle/paper-plane/magnifier/stone/eraser/target on main actions. Measured 16 pages: icons only 16/20/24, 0 console errors; create-room modal x 20px closes. Not seen live: room stand-up x, PM window x, tournament modals, crop rotate. `?v=259`, `npm test` 2755.
