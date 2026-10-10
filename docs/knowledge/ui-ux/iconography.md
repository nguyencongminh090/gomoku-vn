---
name: iconography
description: gomoku-vn icon system for the platform (Arena) pages — one set and weight, a 16/20/24 size scale, label rules, target size, one icon per concept
type: project-decision
apply_when: "adding or changing any icon on a platform page (pl / platform-shell); an icon looks too small, wrong, or unprofessional; adding an icon-only control"
confidence: medium (numbers from external guidelines; registry is a project decision)
sources:
  - NN/g, Icon Usability — https://www.nngroup.com/articles/icon-usability/ (read 2026-10-10)
  - Material Design, System icons — https://material.io/design/iconography/system-icons.html (24dp standard, 20dp dense desktop, 48dp target, 8dp between targets)
  - W3C, Understanding SC 2.5.8 Target Size (Minimum) — https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html (read 2026-10-10)
  - SKILLS_TREE: no iconography note (6 queries, 2026-10-10); related: vbase-depth-motion (same treatment for every control), vstyle-flat-material (icon-only = signifier loss)
date: 2026-10-10 (#214)
---

# Iconography (platform pages)

## Rules
1. **One set, one weight:** Phosphor **Regular**, from `client/assets/icons/phosphor-sprite.svg` (paths from `@phosphor-icons/core` v2).
   No emoji or text glyphs (⌕ ⏳ ✓) as icons. Bold/Fill only where an existing screen already uses them (room) — not on platform pages.
2. **Size scale (CSS vars on `.pl`):** `--icon-sm: 16px` next to text ≤ 14px (buttons, badges, meta lines, links) ·
   `--icon-md: 20px` leading a row/field/toggle label and group titles, menu items, page tabs, icon-only toolbar buttons (nav bell, light/dark) and segment options ·
   `--icon-lg: 24px` mobile tab bar, large standalone icon-only buttons. **Nothing below 16px** (was 11–15px in places).
   ≥ 28px only for illustration (empty state, verdict).
3. **Gap:** 8px icon→label (6px inside badges / meta chips).
4. **Labels:** an icon is never the only carrier of meaning, except near-universal ones (search, home, close ✕, bell,
   light/dark sun-moon) — and those still get `aria-label`. Tabs, segments and buttons show text (NN/g: few icons are
   universally recognised; labels must stay visible, not on hover). 5-second rule: no fitting icon in 5 s → text only.
5. **Targets:** every control ≥ 24×24 CSS px (WCAG 2.2 SC 2.5.8, AA); aim ≥ 40px tall on mobile; ≥ 8px between targets.
6. **Colour:** decorative/leading icons `--c-ink-3`; icons inside buttons inherit `currentColor`.
7. **One icon per concept, one concept per icon** — registry below; reuse before adding.

## Registry (platform pages)
| Concept | Icon | | Concept | Icon |
|---|---|---|---|---|
| Profile / account owner | user-circle | | Edit | pencil-simple |
| Account settings | user-gear | | Save | check |
| Admin / staff | shield-check | | Revert form | arrow-counter-clockwise |
| Friend add / remove | user-plus / user-minus | | Cancel / decline / close | x |
| Challenge | boxing-glove (sword read as a rocket at 16–20px) | | Delete | trash |
| Message / DM | chat-circle | | View (open read-only) | eye |
| Send | paper-plane-tilt | | Load more | caret-down |
| Join by code | door-open | | Date | calendar |
| Rated play | play | | City | map-pin |
| Rating / ranking | crown-simple | | Country | globe |
| Tournament / top rank | trophy | | Achievement | medal |
| First win | flag-checkered | | Privacy | lock |
| Game settings (tab) | sliders-horizontal | | Appearance | paint-brush |
| Light / dark mode | sun / moon (theme row: circle-half) | | Bio | quotes |
| Photo | camera | | Notifications | bell |
| Language | translate | | Density | rows |
| Board display (paper / stone) | checkerboard | | Sound | speaker-high |
| Game history | clock-counter-clockwise | | Online status (hide) | user-circle-dashed |
| Tournament pairings | sword | | Live | broadcast |

## Don't
- Don't scale icons with `1em` inside small text (that produced 11–13px icons).
- Don't put the same icon on two neighbouring fields (country + city were both map-pin).
- Don't use an icon whose metaphor is foreign to the domain (game-controller for a board game's settings).
