---
name: vpick-choosing-style
description: How to turn a website request into two or three fitting visual style directions with reasons and risks; entry point of the visual-design domain
domain: visual-design
tags: visual-style,style-selection,brand,aesthetics,web-design,look-and-feel,landing-page,mood,app,style-recommendation,router
apply_when: "a user asks to design, redesign or restyle a website or landing page; the user asks what style or look fits their site; the request names a mood (modern, premium, playful, trustworthy) but no concrete style"
sources: "NN/g - Testing Visual Design (Chan 2024), Desirability Toolkit (Benedek and Miner 2002 via NN/g), Aesthetic-Usability Effect (Moran 2024), Flat UI eyetracking (Moran 2017), Brutalism and Antidesign (Moran 2017), 4 Credibility Factors (Harley 2016); W3C Understanding WCAG 2.2 SC 1.4.3"
last_reviewed: 2026-09-26
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/visual-design/items/vpick-choosing-style.md
copied: 2026-10-09
---

# Choosing a visual style for a website

A visual style is a skin over the structure of a site: color, type, shape, depth, texture
and motion. It changes how people judge the site before they use it, but it cannot fix a bad
structure. The aesthetic-usability effect (Kurosu and Kashimura, 1995, via NN/g 2024) means
an attractive design is rated as easier to use and earns tolerance for small problems, not
for large ones. So pick the style after the content, navigation and main tasks are known,
and never let it remove the cues people need to act.

## Procedure (why each step matters)

1. **Read the request for five facts.** Site type and main goal (sell, inform, convert,
   show work, run a task); audience (age, expertise, device, context of use); brand
   attributes (3-5 adjectives the site must convey); content density (a few big messages or
   many records); constraints (existing brand, accessibility target, performance budget,
   team skill, framework). If the brand words are missing, ask for them or propose them;
   NN/g's visual-testing guide starts every study by fixing 3-5 target attributes.
2. **Apply hard filters first.** Drop any style that cannot meet the constraints:
   - Accessibility: WCAG 2.2 AA needs 4.5:1 for body text and 3:1 for large text and UI
     parts. Low-contrast styles (neumorphism, heavy glass over photos) fail by default.
   - Task-critical or public-service sites (banking, health, government forms, checkout):
     keep strong signifiers; NN/g measured 22% more time to find targets on pages with weak
     flat signifiers.
   - Older or less digital audiences: prefer familiar controls and high contrast.
   - Color-only signals: status, gains and losses, errors and required fields need an icon,
     sign or label as well as color (WCAG 2.2 SC 1.4.1); check red and green pairs first.
   - Non-English audiences: confirm the chosen fonts cover the language; Vietnamese needs
     stacked diacritics and enough line height (`vbase-typography`, `webx-i18n-l10n`).
   - Numeric data (finance, analytics): tabular figures and clear tables outrank any effect.
   - Performance budget or low-end phones: avoid large blurred layers, heavy 3D and video
     backgrounds.
3. **Match attributes to candidates.** Use the table below, then the site-type matrix in
   `vpick-style-by-site-type`.
4. **Offer 2-3 directions, not one.** A safe direction (the convention for the site type),
   an on-brand direction (strongest match to the adjectives) and, if the brand allows, a
   bold one. For each give: one-line mood, palette idea, type idea, signature detail, why it
   fits, main risk and how the risk is handled.
5. **Validate cheaply** (details in `vpick-brand-attributes`; trend risk in `vpick-trends-longevity`). Show static mockups of the directions to 5-8 target users: a
   5-second first-impression test and a desirability test (users pick words from a list of
   about 25 that includes the brand words and their opposites). Keep the direction whose
   chosen words match the brand words; NN/g recommends this over asking "do you like it".

## Attribute to candidate styles

| Brand words in the request | Candidate styles | Watch out |
|---|---|---|
| clean, professional, calm, clear | `vstyle-minimalism-swiss`, `vstyle-flat-material` | can feel generic; add one signature detail |
| trustworthy, secure, official | minimalism or flat 2.0 with strong signifiers | avoid trend effects that date quickly |
| modern, techy, premium, futuristic | `vstyle-glassmorphism`, `vstyle-dark-mode`, `vstyle-bento-modular` | contrast over backgrounds; blur cost |
| bold, rebellious, creative, indie | `vstyle-brutalism-neobrutalism`, `vstyle-maximalism-expressive`, `vstyle-motion-immersive` | only for audiences that accept it |
| playful, friendly, young | neobrutalism, claymorphism (`vstyle-skeuomorphism-neumorphism`), `vstyle-retro-nostalgia` | childish for serious content |
| warm, human, crafted, authentic | `vstyle-handmade-organic` | illustration cost; must match the product |
| luxury, elegant | minimalism with generous space and refined serif type; restrained glass | slow, image-heavy pages |
| nostalgic, fun, internet culture | Y2K, Memphis, vaporwave, pixel art (`vstyle-retro-nostalgia`) | short trend life; legibility |
| data-heavy, operational | minimalism or flat, dense grid, optional dark theme | decoration steals attention from data |

## Rules for mixing

- One base style decides the system (tokens, components). A second style may add at most
  one accent treatment (for example glass only on the sticky header over a minimal page).
- The accent must never carry the primary action or body text if it lowers contrast.
- Keep interaction cues consistent across the whole site; NN/g links consistent, expected
  interaction to perceived competence and trust (Moran 2016).

## Use when

- Before writing any CSS or tokens for a new site or redesign.
- When the user's request is a mood ("make it look modern") rather than a specification.
- When reviewing a proposed look against the site's goals.

## Do not use when

- An established brand guideline or design system already defines the look: follow it and
  only apply the accessibility checks.
- The site is an internal tool with no brand goal: use a proven component library's default
  theme and spend the effort on tasks.
- The request is about structure (navigation, forms, performance): see `ux-information-architecture`,
  `ux-forms-errors` and `perf-core-web-vitals` instead.

## Trade-offs

- Distinctive style against familiarity: a style that stands out also adds learning cost;
  the more task-driven the site, the more conventional it should be.
- Trend styles look current now and dated in two to three years; neumorphism rose in 2019 and
  declined by 2021.
- Rich effects (blur, 3D, motion) cost render time and battery on low-end devices.

## Common mistakes

- Choosing a style because it is trending, with no link to the brand words or users.
- Presenting one direction only, so the user cannot react to options.
- Judging directions by designer taste; NN/g's brutalism article reminds that "you are not the user".
- Copying a catalog row (for example from `ui-ux-pro-max`) without the hard filters; that
  catalog suggests neumorphism for healthcare and senior care, which fails the contrast filter.

## Related

- Notes: `vpick-style-by-site-type`, `vpick-brand-attributes`, `vpick-trends-longevity`, `vbase-visual-principles`, `vbase-color`, `vbase-typography`, `vbase-layout-spacing`, `vbase-depth-motion`, `vstyle-minimalism-swiss`, `vstyle-flat-material`,
  `vstyle-glassmorphism`, `vstyle-brutalism-neobrutalism`, `vstyle-skeuomorphism-neumorphism`,
  `vstyle-dark-mode`, `vstyle-bento-modular`, `vstyle-retro-nostalgia`, `vstyle-handmade-organic`,
  `vstyle-maximalism-expressive`, `vstyle-motion-immersive`, `ux-design-systems`,
  `a11y-wcag-essentials`, `ux-research-usability`
- Skills: `ui-ux-pro-max` (palettes, font pairs, style catalog), `frontend-design`,
  `frontend-design-anthropic`, `minimalist-ui`, `high-end-visual-design`
