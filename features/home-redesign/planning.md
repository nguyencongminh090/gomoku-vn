# Home redesign — planning (2026-11-12)

Gallery: [index.html](index.html) · fragments `mockups/m1…m8.html` + [common.css](common.css) · [shoot.js](shoot.js) → `shots/<id>-<mode>-<w>[-searching].png`
Supersedes `features/home-fill/` (A/B/C were fill-space ideas; this round is a full home redesign).
Ask (user, 2026-11-12): home shows Vào phòng + Chơi nhanh (with visible options) as the dominant pair;
Học / Diễn đàn / Giải đấu / Hội nhóm icon-only; attractive, creative, background may be reworked.

## Directions
M1 Hai cửa · M2 Bàn cờ sống · M3 Sân khấu quân cờ · M4 Câu lệnh · M5 Đen & Trắng · M6 Vé đấu + Bảng phòng ·
M7 Sơn mài · M8 Bento Arena (idea / style note / motion / risk per card in index.html).

## Constraints all mockups keep
- Real option values only (lobby-home.js QM_RULES / QM_MENU_TIMES, rated/casual); labels from i18n.js.
- States drawn: idle, searching (body.mk-searching), resume = #home-mine-card. Guest note not drawn (same slot as resume).
- Decorative boards are static CSS/SVG, never BoardRenderer; stones never animate (M2 animates only the win-line stroke).
- Fonts: Nunito variable 200–1000 only (self-hosted, CSP).
- No stock photos: no PEXELS/PIXABAY keys in env → all imagery drawn in CSS/SVG.

## Decisions 2026-11-12
M4 chosen · icon-only + tooltip (F4 reversed) · Hội nhóm site-wide → #359 · phone: sentence + Chơi nhanh first · blanks open a dropdown (bottom sheet on phone). → DESIGN.md, todo #358.

## Open questions (answered above)
1. Which direction (or mix, e.g. M3 stones + M6 room board)?
2. Icon-only secondary links reverse ui-audit home F4 (visible labels; touch has no hover) — accept? (tooltip + aria-label kept)
3. Rename "Câu lạc bộ" → "Hội nhóm": home only, or nav + clubs pages too? (record as todo, not built)
4. F5 order on phone: Chơi nhanh first (M1/M5/M8) or Vào phòng first?
5. Headline copy in M2/M7 is draft — keep, rewrite, or drop?

Then: DESIGN.md (ui-brief step 7) → docs/todo item → `ui/home-<slug>` off dev (design-workflow Stage 4).
