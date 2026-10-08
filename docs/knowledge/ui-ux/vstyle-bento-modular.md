---
name: vstyle-bento-modular
description: Bento grids and card-based modular layouts - differently sized tiles that show many features at once; when tiles beat lists, and the rules for hierarchy, responsiveness and density
domain: visual-design
tags: visual-style,bento-grid,cards,modular-layout,feature-grid,dashboard,css-grid
apply_when: "a product page or landing page must show many features or stats at a glance; a request mentions bento, Apple-style feature grid, cards or tiles; personal link pages and portfolios with mixed content; dashboards summarising different kinds of data"
sources: "NN/g - Cards, UI-Component Definition (Laubheimer 2016); SaaSFrame - The bento layout trend and similar trend articles (vendor blogs, seen); Wikipedia - International Typographic Style (grid roots)"
last_reviewed: 2026-09-26
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/visual-design/items/vstyle-bento-modular.md
copied: 2026-10-09
---

# Bento grids and modular card layouts

## Traits

- A grid of rectangular tiles of different sizes, like the compartments of a Japanese bento
  lunch box. Big tile = big message; small tiles = supporting facts.
- Each tile holds one idea: a feature with a short title, a number, a screenshot, a quote, a
  small animation.
- Consistent gap and corner radius; tiles often use soft backgrounds or subtle borders, and
  the style mixes easily with minimal, dark or glass looks.

A bento grid is a layout pattern more than a full visual style: it decides structure, and
another style decides color and depth.

## Origin

Card layouts spread with Google Now and Material Design in the 2010s. The bento variant was
made popular by Apple's product pages (for example the iPhone 14 page, 2022) and its keynote
summary slides (WWDC 2023), then spread to SaaS marketing pages and portfolio sites (trend
articles; not checked against Apple sources). Its roots are the modular grid of the Swiss
style. Claims in vendor blogs about longer dwell time or better retention come without
published method and should not be quoted as fact.

## Fits

- Feature overviews on SaaS and product landing pages: many small benefits shown at once.
- "Year in review" or stats pages, personal link-in-bio pages, portfolios that mix images,
  text and links.
- Dashboards whose widgets show different kinds of information. NN/g: cards work best for
  heterogeneous content and browsing, as entry points to detail (Laubheimer 2016).

## Do not use when

- Items are of the same kind and users scan or compare them (products with prices, search
  results, file lists, pricing plans): NN/g found card layouts less scannable than lists and
  poor for comparison because the eye jumps around.
- The page must be read in order (a story, instructions); tiles break sequence.
- There are only two or three messages: a bento grid adds noise; use full-width sections.

## Accessibility and performance

- Reading order: the visual placement of tiles can differ from DOM order in CSS Grid; keep
  the source order logical so screen readers and keyboard users get a sensible sequence.
- Each tile needs its own heading if it holds a distinct topic; if the whole tile is a link,
  make one link per tile, not nested interactive elements.
- Tiles with autoplay video or animation should pause when off screen and respect
  `prefers-reduced-motion`.
- Many screenshots per page: size and lazy-load them (`fe-media-assets`).

## Keep it usable

- Decide hierarchy first: one or two hero tiles, then medium tiles, then small; if all tiles
  are the same size it is just a card grid.
- One message per tile, a short heading, few words. Put detail behind a link.
- Plan the mobile layout explicitly: on narrow screens tiles collapse into one column, so
  order them by importance, not by how the desktop mosaic looks.
- Keep gaps, radii and padding on a spacing scale so the mosaic looks deliberate.
- Use CSS Grid with named areas or `grid-auto-flow: dense` carefully; dense packing can
  reorder tiles visually away from the DOM order.

```css
.bento { display: grid; gap: 16px; grid-template-columns: repeat(4, 1fr); }
.bento .hero { grid-column: span 2; grid-row: span 2; }
@media (max-width: 40rem) { .bento { grid-template-columns: 1fr; }
  .bento .hero { grid-column: auto; grid-row: auto; } }
```

## Mixing

- Minimal base with bento feature section (the most common pairing), dark theme with glass
  tiles for tech products, neobrutalist tiles with thick borders for playful brands.

## Trade-offs

- Shows many features at a glance and looks current, against scanning and comparison cost,
  harder responsive design and a lot of content to produce for each tile.
- Trend risk: the look was everywhere by the mid-2020s, so it can feel generic.

## Common mistakes

- Using bento tiles for a product catalog or a pricing table.
- Tiles full of paragraphs.
- A desktop mosaic that becomes a long random list on phones.

## Related

- Notes: `vpick-choosing-style`, `vpick-style-by-site-type`, `vstyle-minimalism-swiss`,
  `vstyle-glassmorphism`, `ux-responsive-mobile-first`, `fe-media-assets`
- Skills: `ui-ux-pro-max`, `frontend-design`, `high-end-visual-design`
