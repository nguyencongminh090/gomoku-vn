---
name: vbase-color
description: Building a website color palette - harmony schemes, palette size, semantic roles, contrast targets and color-only pitfalls - as the reusable part behind any visual style
domain: visual-design
tags: color,palette,color-scheme,contrast,semantic-color,wcag,brand-color,dark-mode
apply_when: "choosing or checking a palette for a new site or redesign; a style note gives mood but no colors; brand colors must work for text, buttons and states; a user asks which colors to use"
sources: "Wikipedia - Color scheme (monochromatic, analogous, complementary, split-complementary, triadic, tetradic); NN/g - Good Visual Design (Gordon 2025), Visual Hierarchy in UX (Gordon 2021); W3C Understanding WCAG 2.2 SC 1.4.3, 1.4.1, 1.4.11; Material Design 2 - Dark theme"
last_reviewed: 2026-09-26
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/visual-design/items/vbase-color.md
copied: 2026-10-09
---

# Color for websites

Color carries mood and hierarchy. Choose it from brand words first, then check it against
contrast and meaning rules.

## Schemes (starting points, not laws)

| Scheme | Built from | Feel | Watch out |
|---|---|---|---|
| Monochromatic | one hue in tints and shades | calm, polished, low energy | flat hierarchy; needs strong lightness steps |
| Analogous | neighbouring hues (about 30 degrees either side) | harmonious, gentle | low contrast between elements |
| Complementary | opposite hues | high energy, strong contrast | full-saturation pairs vibrate; use one as accent |
| Split-complementary | base plus the two hues beside its complement | strong but less tense | needs one dominant color |
| Triadic | three hues 120 degrees apart | rich, playful | hard to balance; one dominates |
| Tetradic | two complementary pairs | very rich | easy to look chaotic |

For most sites a neutral scale plus one brand color plus one accent is enough. NN/g suggests
about two colors to keep balance and hierarchy, and monochromatic palettes for accessible,
polished results; avoid overly saturated or neon colors for large areas.

## Build the palette in roles

1. **Neutrals** (9-11 steps from near-white to near-black): backgrounds, borders, text.
2. **Brand / primary**: main actions and key highlights.
3. **Accent**: one secondary color for emphasis, used sparingly.
4. **Semantic**: success, warning, error, info. Keep them stable across styles so their meaning
   is learned.
5. Name tokens by role (`surface`, `on-surface`, `primary`, `danger`), not by value, so a
   rebrand or dark theme does not break meaning (`ux-design-systems`).

## Mood guide (common practice, cultural and brand context vary)

Blue: trust, calm; green: growth, health, success; red: urgency, danger, energy; orange and
yellow: warmth, attention; purple: creativity or luxury; black and gold: premium; warm earth
tones: natural and handmade. Treat these as hypotheses to check with the brand words and
audience, not as facts.

## Rules that must hold

- Text contrast: 4.5:1 normal text, 3:1 large text (WCAG 2.2 SC 1.4.3); UI component boundaries
  and states 3:1 (SC 1.4.11). Logotypes and purely decorative text are exempt.
- Color is never the only signal (SC 1.4.1): add an icon, label or underline. Links inside
  text need an underline or at least 3:1 contrast from surrounding text.
- Check the brand color as a background for white text; mid-tone orange, green and yellow
  often fail.
- Make a dark version deliberately: desaturate colors and use lighter surfaces for elevation
  (`vstyle-dark-mode`).
- Verify with a contrast checker and a color-blindness simulator before sign-off.

## Use when

- Turning a style direction into tokens; auditing an existing palette.

## Do not use when

- A brand palette is fixed by guidelines: keep it and only add accessible tints and states.
- Charts and data visualisation need categorical palettes: use the dataviz guidance instead of
  UI brand colors.

## Trade-offs

- Few colors give clarity and easy theming, against a plain look. A bold multi-color palette
  gives identity but multiplies contrast checks and hierarchy problems.

## Common mistakes

- Choosing colors from a mood board and testing contrast only at the end.
- Red and green as the only difference between success and error.
- Twelve accent colors with no roles.

## Related

- Notes: `vbase-visual-principles`, `vbase-depth-motion`, `vstyle-dark-mode`,
  `vstyle-maximalism-expressive`, `a11y-wcag-essentials`, `ux-design-systems`
- Skills: `ui-ux-pro-max` (colors.csv has about 95 palettes by product type), `design-system`
