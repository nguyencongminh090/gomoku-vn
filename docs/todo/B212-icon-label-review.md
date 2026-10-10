# B212 — Icon + label review: icons that match their meaning, shorter labels
**Status:** OPEN — built 2026-10-10 on `ui/icon-label-polish`, awaiting review
**Area:** client/assets/icons/phosphor-sprite.svg, client/*.html, client/js/{profile,lobby-home,i18n}.js, client/css/platform.css
**From:** user 2026-10-10 "Review icon and improve icon … tránh việc sử dụng text quá dài"; audit = real-server scan of 13 pages × 1280/390   **Depends:** —

## Problem
Audit: icons that say the wrong thing (`Vào bằng mã` = sword, the challenge icon; `Ai được nhắn tin` = text-align icon, same as Bio;
Settings `Tài khoản` = shield-check, same as Admin), text glyphs instead of the sprite (`⌕` search, `⏳` overlay), Settings tabs on
≤860px are icon-only with no accessible name, 6 `✕` close buttons in tournament.html with no name, long labels (`Giới thiệu (tối đa 280 ký tự)`,
`Ai được gửi lời mời kết bạn`, `Quay lại danh sách giải đấu`, quick-play buttons wrap to 2 rows on 390px).

## Scope
1. Sprite: add Phosphor regular `door-open`, `chat-circle`, `user-gear`, `play` (paths from @phosphor-icons/core 2, same as existing).
2. Icons: join-by-code → door-open; who-can-DM → chat-circle; Settings Account tab → user-gear; rankings/clubs search ⌕ → magnifying-glass; room overlay ⏳ → hourglass.
3. Icons on actions: profile Kết bạn (user-plus) / Thách đấu (sword) / Nhắn tin (chat-circle); quick-play primary → play (Arena mockup).
4. A11y: Settings tab labels on mobile hidden visually, not `display:none` (keeps the name); `aria-label` on unnamed ✕ buttons.
5. Shorter vi+en labels: bio + clubs.desc (limit → placeholder `common.max_280`), who_dm/challenge/friend, qm.find_rated / challenge_friend, tdetail.back, tmatch.back.
## Don't
- Board/stones, backend, layout. Don't drop the `⚠` prefix in chat system lines (`chat-ui.js` keys the error toast off it).
- Don't change Settings' icon-first mobile tabs (B211 design) — only restore their names.
## Why this way
Same icon = same concept across pages (`docs/knowledge/ui-ux/ux-information-architecture.md`: one name per concept); icon-only
controls need an accessible name (`a11y-aria-keyboard-focus.md`). Icon choices follow the Arena mockup where it has one (door, play, magnifier).
## Done when
- jsdom tests for profile/lobby-home/settings icons + names; `npm test`; real-browser re-scan: no unnamed controls, no glyph icons.
## Result
`icon-label-review.test.js` (29) + profile/lobby-home asserts; 10 fail on the old code. Re-scan 13 pages × 1280/390:
glyph icons 4→0, unnamed Settings tabs 3→0. NOT met: quick-play still 2 rows at 390 (needs ~395px of ~338px) — only fits with
labels too terse to read. Not opened: tournament detail/match pages (no tournament seeded), light mode, the room entry overlay.
Note: first build was lost with the session scratchpad worktree before commit; re-applied 1:1 from the session record.
