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
