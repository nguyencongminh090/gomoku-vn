# Profile header: avatar proportion — research (2026-10-15)

Trigger: desktop profile header (`.pprofile .phead`, `client/css/platform.css`) — 88px avatar looked small next to a ~190px identity block + 4-col stat grid.

## Internal knowledge (checked first)
- `docs/knowledge/ui-ux/vbase-visual-principles.md` — ≤3 sizes, ≤2 "biggest" elements, squint test (blur 5–20px: the dominant element must be the important one).
- `docs/knowledge/ui-ux/vbase-layout-spacing.md` — 4/8 scale; avoid random values (13, 17).
- `SKILLS_TREE …/vstyle-bento-modular.md` — hero tile + smaller tiles; equal tiles = plain card grid.
- **Gap:** no note gives an avatar-to-header ratio. Search of SKILLS_TREE (4 queries) found none.

## Web (design-system docs; no universal ratio exists)
- PatternFly avatar: 24 (dense list) / 36 (masthead) / 72 (card) / **128 (profile display)** — https://patternfly.org/components/avatar/design-guidelines
- GitHub Primer: base-4 steps to 32, base-8 to 48, max 64 in the scale — https://primer.style/components/avatar
- ServiceNow Horizon: large for profile view, extra-large for profile edit — https://horizon.servicenow.com/workspace/components/now-avatar
- Searches for a "avatar : header height" ratio returned only platform banner specs (e.g. X 1500×500 = 3:1), not a rule.

## Takeaways for this repo
- Profile avatars in design systems: ~96–128px; keep on the 8px scale → **128px** is the defensible value (current CSS: 136px, off-scale).
- Judge balance by the squint test on the real screenshot, not a ratio: avatar ≈ 60–70% of the identity-block height is what looked balanced here.
- Mobile keeps 64px (≈ PatternFly "card" 72 / Primer 64).
