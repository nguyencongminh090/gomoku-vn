# 2026-11-25 — #426 Tournament match board wider than a phone viewport (clipped both sides)
## Prompt
"Do #426" — on tournament-match.html at 390px, `#board-wrap` 420px at left -15, board clipped both edges.
## Root cause
Pure CSS, not the renderer and not #425 (reproduced on a non-Renju static page at 360/375/390).
room.css's mobile block gives `.board-area-shell` a full-bleed `width:calc(100% + 32px); margin-left:-16px`
that assumes a 16px `.room` padding, while the same block sets `.room { padding: 0 }`. room.html cancels it in
room-arena.css (`body.arena-room .board-area-shell { width:100%; margin:0 }`); tournament-match.html has no
`arena-room`, so its shell overshot 16px per side and `BoardRenderer.resize()` (fits the svg to the parent's
clientWidth) sized the board to that too-wide box. tournament.css had only patched the symptom on the
clocks/actions siblings (calc(100% - 32px) + 16px inset).
## Fix
- `client/css/tournament.css` (≤768px): `.room .board-area-shell { width:100%; margin-left:0 }`; clocks/actions
  back to `width:100%; margin-left:0` (same on-screen box as before). room.html / room.css untouched (todo Don't).
- Branched off `dev` (`#426` not on `main`).
## Verification
- New `e2e/tournament-match-board-phone-width.spec.ts`: serves client/ via `page.route`, scripts aborted (no server/DB);
  360/375/390px: shell, wrap, clocks inside viewport, wrap ≥ vw-2 (.board-area 1px frame), no horizontal scroll.
  Red on old CSS (shell left -16), green after. Run needs `PW_CHROMIUM_PATH` (installed headless shell 1243).
- cache-bust OK. `npm test` 4893/4893.
- Not done: live tournament match in a real browser (needs a seeded tournament); svg size follows the wrap via resize().

## Follow-up 2026-11-25 07:40 — leftover .board-area frame (branch fix/426-board-area-frame)
- Live pass (isolated server :3101, temp `GOMOKU_DB_PATH`, 2 registered users, real round-robin match, 5 corner/centre
  moves, Chromium 360/375/390 touch @2x): board + all 34 labels inside the viewport, scrollWidth = vw, 0 console errors.
- It also showed the shell fix exposing .board-area's desktop frame (room.css: 1px border, 2rem radius, shadow) as a
  dark rounded edge behind the board's top corners (it used to sit off-screen at -16px). room.html drops it
  (room-arena.css); tournament.css ≤768px now does too: `.room .board-area { border:0; border-radius:0; box-shadow:none; background:none }`.
- Spec tightened: wrap width == vw and #board-area frame computed as 0px/0px/none; red without the rule, green with.
  Live rerun: wrap 0..vw, svg 0.3..389.7 at 390. cache-bust OK, `npm test` 4893/4893.
