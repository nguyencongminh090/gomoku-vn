# Rankings redesign — 8 mockups (2026-11-14)
Brief: boring/Excel-like, top 3 not prominent, no story. Backend + board locked. Mockups static, `mockups/rk*.html`, gallery `index.html`, shots via `node features/rankings-redesign/shoot.js`.
Needs new data (not built): RK2 tier thresholds, RK6 daily rank history (approximated from delta7), RK8 neighbours-of-me API, RK7 story lines (client-derived from delta7).
Open: user picks one (or a merge, e.g. RK7 stories + RK1 podium + RK8 my-dock) → then `docs/todo/<CODE>` + implement on `ui/rankings-<slug>` off dev.
Round 2 (2026-11-14): 8 more directions proposed (RK9 map, RK10 race, RK11 cards, RK12 Đông Hồ, RK13 neo-brutal, RK14 bento, RK15 club treemap, RK16 orbit); user picked RK10-13 → built. RK10 needs daily rating history API; RK11 tier thresholds; RK13 win-streak sticker needs streak API. RK9/14/15/16 not built.
Round 3 (2026-11-14): user picked RK1 + RK4 + 5s load animation → RK17 mockup (rk17-podium-board.html), intro frames via frames.js. Intro: 1x/session, skip on any input, reduced-motion = final state. Next: user OK → DESIGN.md section + docs/todo + ui/rankings-podium-board off dev.
