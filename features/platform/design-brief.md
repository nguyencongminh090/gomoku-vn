# Platform — design brief (B172, 2026-10-09)

Answers (user): base = Zen/Sumie lobby mockups · 2 directions · overview of **all** functions (not just Profile/Rankings/Clubs) · desktop + mobile (bottom tabs) · rating per variant × speed.
Grounding: `docs/knowledge/ui-ux/` (ux-information-architecture, ux-responsive-mobile-first).

| Direction | File | Positioning |
|---|---|---|
| **A — Zen** | `client/platform-zen-mockup.html` | White, Manrope light, top bar, one centred column, hairlines, no cards. Calm, low density. Black/white only. |
| **B — Sumie** | `client/platform-sumie-mockup.html` | Warm paper, serif italic display, vertical left rail, bordered surfaces, denser tables, one vermilion seal accent for primary actions. |

Both: same IA and same 11 screens (Home/Play, Rooms, Tournaments, Rankings, Profile, Clubs, Club, Social, Learn, Settings, Admin), same data; only tokens + layout chrome differ. Board/stones not redesigned (mini boards are decorative SVG). Mockups are static, not linked from the app, no `?v=` bump.
| **C — Arena** | `client/platform-arena-mockup.html` | Added on request: dark dashboard in the Lichess/chess.com vein — panel cards, denser rows/tables, green accent, wood-tone mini boards. |
| **D — Bento** | `client/platform-bento-mockup.html` | Added on request: light, colourful rounded "bento" tiles, floating pill nav, pill buttons, friendly/gamified feel (aimed at a broad public audience). |

**Update 2026-10-09:** Arena is the default skin and has dark + light modes (toggle in nav; `?mode=light|dark` in the mockup). A and D selectable skins later; B dropped.
