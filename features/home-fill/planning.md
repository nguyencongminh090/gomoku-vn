# Home fill-space — planning (2026-11-12)

Links: [user_story](user_story.md) · mockup [mockup-inject.js](mockup-inject.js) · [shoot.js](shoot.js) · `shots/<now|a|b|c>-<light|dark>-<w>.png`
Problem: after the hub (and ui-audit home F6, left-aligned hub) 768–1440 px leave ~35–40 % of the first screen empty.
Data: every block below is already in `GET /api/home` (`live` ≤3, `tournaments` ≤5, `forum` 3, `learn`) — client-only, no server change.

## Directions (mockups injected into the real page)
- **A — "Đang diễn ra" column.** Desktop: hub left (520 px), right column = live games (Đen vs Trắng, rule, moves, viewers, Xem) + tournaments (Đăng ký/Xem). Tablet/phone: stacked under the hub. Icon links stay.
- **B — Bento tiles.** The 4 icon links become 4 tiles (Học + progress bar, Đang diễn ra top game, Giải đấu next, Diễn đàn top thread), right column on desktop, 2×2 under the hub on tablet. Grounded: vstyle-bento-modular (different kinds of content → tiles OK). Tile meta must follow ticket-rows (segments, no "a · b").
- **C — Centred hub + band.** Greeting/stats/hub centred (undoes F6 alignment), full-width 3-column band below: live | tournaments | forum. Fills vertical space; needs scrolling on 900 px.

## Open questions
1. Which direction (A / B / C / mix)?
2. Empty state (small site: often 0 live, 0 tournaments): hide the block, or show "Chưa có ván — Tạo phòng"?
3. Phone (≤860): show the new blocks under the hub, or keep phone as is (it is only ~20 % empty)?
4. F5 (Vào Phòng above Chơi nhanh) — keep?

Then: docs/todo item + ui/home-fill branch off dev (design-workflow Stage 4).
