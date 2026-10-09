---
name: fe-css-architecture
description: Keeping CSS maintainable at scale - understanding the cascade, cascade layers to control precedence, modern layout, and the trade-off between semantic class names and utility-first CSS
domain: web-development
tags: css,cascade,cascade-layers,specificity,utility-first,tailwind,naming
apply_when: "styles override each other unpredictably; !important is spreading; importing a CSS framework; choosing between component CSS, utility classes and global styles; setting up theme variables"
sources: "MDN - The CSS cascade (read); Tailwind CSS docs - Styling with utility classes (read); MDN - Responsive web design (read); BEM naming (page not readable; not relied on)"
last_reviewed: 2026-09-25
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/fe-css-architecture.md
copied: 2026-10-09
---

# CSS architecture

## How the cascade decides

When several declarations target the same property, the browser resolves them in order:
relevance (does the selector and media condition match), then **origin and importance**
(user agent, user, author; `!important` reverses the order), then **specificity**, then scope
proximity (`@scope`), then **order of appearance** (last wins). Origin is checked before
specificity, so a low-specificity rule in a stronger origin beats a high-specificity one in a
weaker origin. Most "why is my style ignored" bugs are specificity or order problems.

## Cascade layers

`@layer` gives an explicit order that beats specificity. Declare the order once, for example
`@layer reset, framework, theme, components, utilities;` later layers win over earlier ones
regardless of selector strength; unlayered author styles beat layered ones; for `!important` the
order reverses. Uses named by MDN: import a third-party stylesheet into a low layer
(`@import "lib.css" layer(framework)`) so your styles override it without `!important`, and
avoid specificity arms races. Check Baseline status for your browser targets
(`fe-browser-support-baseline`).

## Structuring styles

- **Design tokens as custom properties** (color, spacing, type scale) at the root or theme level, aligned with `ux-design-systems`.
- Use flexbox and grid for layout; they are responsive by default (`ux-responsive-mobile-first`).
- Keep selectors shallow and low in specificity; prefer classes over element or ID selectors for reusable styling.
- Scope styles to components (component-scoped CSS, CSS modules, `@scope`, or naming conventions such as BEM) so a change in one place does not leak elsewhere.
- Do not rely on styles for meaning or function (`fe-html-progressive-enhancement`).

## Utility-first versus semantic classes

Utility-first CSS (Tailwind is the main example) composes single-purpose classes in markup
instead of naming components. Its documentation claims faster development (no naming), safer
local changes, portability, and a CSS file that stops growing because utilities are reused;
compared with inline styles it adds design constraints from a theme, state variants (hover,
focus) and responsive breakpoints. Repetition is handled with loops, components or partials,
and small `@layer components` classes. These are vendor claims: the costs are long class lists
in markup and dependence on the tool's conventions. Semantic class CSS keeps markup clean and
puts styling knowledge in the stylesheet, at the price of naming discipline and possible
growth. Either works; pick one per project and use components so the utility strings live once.

## Use when

- Starting a project's CSS approach, adopting a framework, or fixing precedence conflicts.

## Do not use when

- Do not add layers or a heavy methodology to a small static site with a few dozen rules.
- Do not mix two full styling systems (for example a large component framework and a utility framework) without deciding which layer wins.

## Trade-offs

- Layers make order explicit and require the team to learn and document it.
- Utility-first speeds up UI work in component-based projects and hurts in projects without components, where repeated class lists spread.

## Common mistakes

- Fighting specificity with `!important` or longer selectors instead of restructuring or using layers.
- Global element-level overrides that break unrelated pages.
- Unlayered styles unintentionally beating all layered ones.

## Related

- Notes: `fe-html-progressive-enhancement`, `fe-build-tooling`, `ux-design-systems`,
  `ux-responsive-mobile-first`, `fe-browser-support-baseline`
- Skills: `google-style-html-css`, `frontend-design`
