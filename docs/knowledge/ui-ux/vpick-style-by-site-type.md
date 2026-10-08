---
name: vpick-style-by-site-type
description: Matrix from website type (SaaS, shop, bank, portfolio, government, blog, game, kids and more) to safe and bold style candidates, styles to avoid, and the reason
domain: visual-design
tags: visual-style,site-type,industry,style-matrix,recommendation,e-commerce,shop,wellness,meditation,mobile-app,landing-page,portfolio,saas
apply_when: "the site type or industry is known and you need a shortlist of visual styles; checking whether a proposed style suits a kind of site"
sources: "NN/g - Flat UI eyetracking (Moran 2017), Glassmorphism (Brown 2024), Skeuomorphism and neumorphism (Chan 2024), Handmade Designs (Chan 2026), Brutalism and Antidesign (Moran 2017), Neobrutalism (Sheikh 2025), Dark Mode vs Light Mode (Budiu 2020), 4 Credibility Factors (Harley 2016); ui-ux-pro-max products.csv (cross-check only)"
last_reviewed: 2026-09-26
confidence: low
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/visual-design/items/vpick-style-by-site-type.md
copied: 2026-10-09
---

# Visual style by site type

This matrix is a starting shortlist, not a rule. It combines the risk findings of the cited
NN/g articles with common practice seen across current sites and the `ui-ux-pro-max`
catalog, which was used only as a cross-check. Rows marked with a reason from research say
so; the rest is judgement, which is why the note is `low`. Always run the hard filters and
brand-word match in `vpick-choosing-style` after picking a row.

## How to read it

- **Safe**: the convention for the type; users already know it, lowest risk.
- **Bold**: a stronger look that still works when the brand words ask for it.
- **Avoid**: styles whose known risks hit this type hardest.

## Matrix

| Site type | Safe | Bold | Avoid | Why |
|---|---|---|---|---|
| SaaS marketing site | minimalism, flat 2.0 | bento feature grid, restrained glass accents, dark hero | antidesign | must explain the product fast; bento suits many small features |
| Web app, dashboard, admin | flat 2.0 or Material-like, dense grid | optional dark theme | glass over data, neumorphism, heavy motion | data needs contrast and clear controls (Moran 2017) |
| E-commerce (mass market) | flat 2.0 with strong buttons, product-first | vibrant blocks, neobrutalism for young brands | low-contrast styles on price and checkout | checkout is task-critical; trust depends on visible prices and fees (Harley 2016) |
| Luxury, fashion, hotel | minimalism with large imagery and refined type | editorial layouts, subtle motion | busy retro, neon | restraint and space signal price level (common practice) |
| Bank, fintech, insurance | minimalism, flat 2.0, high contrast | dark theme for trading or crypto apps, restrained glass | neumorphism, antidesign | credibility and signifiers matter most (Harley 2016; Moran 2017); never show gains and losses by red and green alone (WCAG 2.2 SC 1.4.1) |
| Healthcare, public service, government | accessible minimal or flat, large type, strong signifiers | none needed | neumorphism, glass over text, trend effects | everyone must be able to use it, including older users and users with weak vision; low-contrast styles fail them (Chan 2024 on neumorphism) |
| Education, e-learning | flat, friendly color | claymorphism, playful illustration | dense dark themes for young learners | approachable and clear progress |
| Kids products | flat with bright blocks, big targets | claymorphism, playful 3D | minimal grey, small type | must read as friendly and easy to hit |
| Portfolio, agency, studio | minimalism or Swiss grid with big work images | brutalism, neobrutalism, kinetic type, 3D | clutter that hides the work | audience is often design-literate, so bold looks are accepted (Moran 2017) |
| Personal blog, news, docs | minimal editorial, strong typography | Swiss grid, dark reading mode as an option | glass, heavy motion | reading comfort; light mode reads better for most users, offer dark as a choice (Budiu 2020) |
| Startup landing page | minimalism or flat with one bold accent | neobrutalism, bento, gradients | style that hides the call to action | one message and one action |
| Developer tools | minimal, monospace accents | dark theme default with light option, bento | decorative effects | audience expects dark and code-like looks; still offer light |
| Games, music, entertainment | dark theme, vibrant accents | maximalism, retro (Y2K, vaporwave, pixel), 3D, motion | corporate minimal | mood matters more than speed of tasks; still keep menus usable |
| Creative community, indie tools, Gen Z brands | neobrutalism | maximalism, Y2K, handmade | sterile corporate look | the look is part of identity (Sheikh 2025 on Gumroad) |
| Wellness, meditation, spa | soft minimal, warm palette, organic shapes | subtle glass, handmade illustration | neumorphism for text and controls | calm feel without giving up contrast |
| Restaurant, local business | photo-led minimal or warm flat | handmade, retro to match the venue | effects that slow mobile load | users want menu, hours, location fast on phones |
| Non-profit, sustainability | warm minimal, strong photography | handmade, organic | luxury gloss | authenticity; handmade signals human effort (Chan 2026) |
| AI product | minimal with a clear input area | subtle glass, gradients, handmade to stand apart | generic AI purple gradient look | polish alone no longer signals quality when AI can produce it (Chan 2026) |

## Use when

- The request names the kind of site and you need two or three candidates quickly.
- Checking whether a style someone proposed is a known poor fit.

## Do not use when

- The brand already has a design language: follow it.
- The audience is unusual for the type (for example a bank for gamers); start from the
  audience and brand words in `vpick-choosing-style`, not the row.
- As proof: the matrix is judgement; validate the chosen direction with users.

## Trade-offs

- Safe picks reduce risk and differentiation together. A bold pick helps recall but needs
  testing and a clear accessibility plan.
- Following the convention of a type (for example dark themes for developer tools) meets
  expectations but can exclude users who read better in light mode, so offer both.

## Common mistakes

- Using the industry row and ignoring the audience inside it (a pension site is not a
  crypto app though both are finance).
- Treating a catalog's "primary style" as final. The `ui-ux-pro-max` catalog lists
  neumorphism for healthcare, mental health and senior care; the NN/g contrast findings rule
  it out for text and controls there.
- Applying a bold style everywhere, including checkout and forms, where conventions win.

## Related

- Notes: `vpick-choosing-style`, `vstyle-minimalism-swiss`, `vstyle-flat-material`,
  `vstyle-glassmorphism`, `vstyle-brutalism-neobrutalism`, `a11y-wcag-essentials`, `ux-forms-errors`
- Skills: `ui-ux-pro-max` (products.csv has about 95 finer product types)
