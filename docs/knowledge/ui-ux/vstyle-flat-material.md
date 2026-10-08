---
name: vstyle-flat-material
description: Flat design, flat 2.0 (semi-flat) and Material Design as web styles - solid color, simple shapes, light depth for signifiers; the default look of apps and SaaS and its known usability trap
domain: visual-design
tags: visual-style,flat-design,flat-2.0,material-design,semi-flat,signifiers,app-ui
apply_when: "web apps, dashboards, SaaS, e-commerce and any task-heavy site; brand words like modern, clear, efficient, friendly; the team will use a component library such as Material, Fluent or a Tailwind kit"
sources: "NN/g - Flat Design and Flat 2.0 (Moran 2015), Flat UI Elements Attract Less Attention (Moran 2017); Wikipedia - Flat design, Material Design; W3C Understanding WCAG 2.2 SC 1.4.11"
last_reviewed: 2026-09-26
confidence: high
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/visual-design/items/vstyle-flat-material.md
copied: 2026-10-09
---

# Flat, flat 2.0 and Material

## Traits

- **Flat**: no gloss, textures or 3D; solid color fields, simple geometric icons, clean
  sans-serif type, clear grid.
- **Flat 2.0 (semi-flat, almost flat)**: flat surfaces plus small cues for depth and
  interactivity: soft shadows on raised controls, subtle highlights, layered cards.
- **Material Design**: Google's system built on flat 2.0 (2014), using a physical metaphor
  of surfaces with elevation and shadow, a grid, and meaningful motion; Material You /
  Material 3 (2021) added user-derived dynamic color and more shape variety; Material 3
  Expressive (2025) adds bolder color, shape and motion.

## Origin

Flat design grew from the Swiss style and modernism. On screens it arrived with Microsoft's
Zune (2006) and the Metro language of Windows Phone 7 (2010) and Windows 8, and went
mainstream when iOS 7 (2013) dropped Apple's skeuomorphic look. It was a reaction to glossy,
textured skeuomorphism and fitted responsive design because simple shapes scale well.
Research on its weak signifiers (below) pushed the industry to flat 2.0, and Material is the
best-known flat 2.0 system.

## Fits

- Web apps, admin panels and dashboards; SaaS products and their marketing sites.
- E-commerce and marketplaces, where clear buttons and product images matter most.
- Teams that adopt a component library: Material, Fluent and most Tailwind kits are flat 2.0.

## Do not use when

- Pure flat (no depth, no link styling) on task-critical pages: NN/g's eyetracking study
  (71 users, 9 page pairs) found 22% more time and 25% more fixations on pages with weak
  signifiers.
- The brand needs strong personality (luxury, art, youth culture) and the team would use the
  library's default theme unchanged: the result looks like every other app.
- The audience is new to digital interfaces; they rely most on conventional cues such as
  underlined links and raised buttons (Moran 2015).

## Accessibility and performance

- Good performance: solid colors, SVG icons, few images.
- Main risk is signifier loss: links styled like body text, ghost buttons, icon-only controls,
  disabled-looking primary buttons. Non-text contrast for controls and focus indicators needs
  3:1 against adjacent colors (WCAG 2.2 SC 1.4.11).
- Flat color blocks with white text often miss 4.5:1 (for example white on mid orange or
  light green); check each brand color used as a background.

## Keep it usable

- Make every clickable thing look clickable: filled primary buttons, a visible outline or
  fill for secondary buttons, links in a distinct color and underlined in body text.
- Use elevation (a small shadow) only to mean "above" or "interactive", not as decoration.
- Place elements where users expect them; NN/g found flat works well with low density,
  standard placement and high-contrast targets (Moran 2017).
- Theme the library: change type, color, radius and one signature element before shipping.

## Mixing

- The most common base for other looks: add glass to overlays, a bento grid on the features
  page, brutalist borders for a playful brand (neobrutalism is flat plus thick borders and hard
  shadows), or a dark theme.

## Trade-offs

- Fast to build and scale, familiar to users, strong library support, against sameness and the
  signifier trap when pushed to pure flat.
- Material gives a complete system (components, motion, color roles), but its look is
  strongly associated with Google and Android unless themed.

## Common mistakes

- Removing all shadows and borders from inputs so fields vanish on white backgrounds.
- Using the brand color for both links and non-clickable headings.
- Treating Material as a visual skin while ignoring its interaction rules, so motion and
  elevation become random.

## Related

- Notes: `vpick-choosing-style`, `vstyle-minimalism-swiss`, `vstyle-glassmorphism`,
  `vstyle-brutalism-neobrutalism`, `ux-design-systems`, `a11y-wcag-essentials`
- Skills: `ui-ux-pro-max`, `design-system`, `frontend-design`
