# B289 — Lobby: one primary action per screen (secondary "Browse open rooms" must not be solid)
**Status:** OPEN — in progress
**Area:** client/index.html, client/css/shell.css, client/js/lobby-home.js
**From:** lobby UI audit (user, 2026-10-19)   **Depends:** —

## Problem
Audit finding 1. Two solid-green buttons compete: "Đấu xếp hạng" (quick-match card) and "Xem phòng đang mở" (Ván đang chơi empty state).
## Scope
1. `renderMine` empty state (client/js/lobby-home.js): drop `link-action--primary` from the find-room button; style it outline/ghost via `.hempty .link-action` in shell.css.
2. Quick-match rated button stays the only filled CTA for members; guests keep casual as primary (existing logic).
## Don't
- Do not change which screen the button opens or the matchmaking logic.
- No new button variants: reuse the ghost look already in `#qm-actions .link-action`.
## Traps
- `.link-action` default is a filled grey button; `--primary` on the same element also appears in other bars (Tạo phòng) — scope to `.hempty`.
## Why this way
Knowledge: docs/knowledge/ui-ux/vbase-visual-principles.md, docs/knowledge/ui-ux/vbase-eye-flow-scanning.md (eye-flow: SKILLS_TREE reference, see INDEX).
## Done when
- Verified in a real browser at 375/768/1280/1440 and `npm test` green.
