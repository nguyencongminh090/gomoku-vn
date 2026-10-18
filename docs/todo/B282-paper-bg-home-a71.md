# B282 — Paper background (grid + leaves) on every platform page, card shadows, home layout A7.1
**Status:** ✅ DONE 2026-10-18 on `ui/grid-leaves-home` (not merged; awaiting "commit and merge")
**Area:** client/css/{tokens,platform,shell,puzzles,forum}.css, client/index.html, client/js/{lobby-home,i18n}.js, client/assets/patterns/leaves.svg
**From:** design-workflow round 2026-10-18 (mockups A…A7.1; chosen `client/index-a7-1-mockup.html`)   **Depends:** —

## Problem
Flat dark/light pages had no identity and no depth; home quick-match was an unlabelled run of chips with equal-weight buttons.

## Scope
1. Tokens (6 skin×mode blocks): `--bg-grid`, `--bg-grid-minor`, `--bg-leaf-op`, `--bg-leaf-filter`, `--shadow-card`.
2. platform.css: `body.pl`/`body.zen-lobby` `::before` 48px/12px paper grid, `::after` corner leaves (plain background-image), body transparent over `html` bg.
3. Outer cards (`.ppanel .phead .ptbl-wrap .pz-card .fm-post .hnews__line`) use `--shadow-card`.
4. Home only: two card stacks, group labels, ✓ on chosen chip, dominant CTA, learn progress bar, "Xem phòng đang mở", today link to `#tournaments`.
5. Leaves SVG 735 KB → 98 KB (4 shapes + 24 `<use>`).

## Don't
- No server/ change; no board/stone CSS; keep every `qm-*`/`home-*` id and the B261 `:empty` reserves.
- Never commit root `assets/` (Pixabay originals).

## Traps
- `body` background painted over the `z-index:-1` layers (html also paints `--c-bg`) → body must be transparent.
- `background-position: calc(100% - n)` is relative to (box − image): use edge keywords.
- Misaligned grid layers (centered origin) = moiré: both layers at `0 0`.
- CSS `mask` from a `file://` SVG fails → leaves are a plain background-image.
- platform-shell test forbids hex in platform.css: use `black`, not `#000`.

## Why this way
Tokens per skin so zen is greyscale; `docs/knowledge/ui-ux/vbase-depth-motion.md` for layered shadow.
Rejected: "Tìm đối thủ" label (unclear it leads to Phòng); invented links "giải đã diễn ra"/"ván gần đây" (no route).

## Done when
- jsdom: lobby-home (labels, stacks, progress, empty states), page-paper (tokens ×6, layers, asset).
- Real browser (isolated DB, guest + member): home 3 skins × light/dark, 390 px, rankings, clubs, puzzle editor.

## Follow-ups (same branch, user feedback after the first pass)
- Leaves: dark theme (arena/bento) uses `leaves-green.svg`; light + zen keep the neutral `leaves.svg`. Dark opacity .28.
- Nav brand = typographic wordmark ("Play" + brand-coloured "3CR"), no icon mark; `pnav__*` only (room/tournament-match `topnav` still has the mark).
- Avatar chip = avatar + name; rating line moved to a `.pnav__who` header inside the account menu.
