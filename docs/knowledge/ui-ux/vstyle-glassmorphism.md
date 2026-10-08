---
name: vstyle-glassmorphism
description: Glassmorphism, Apple's Liquid Glass and related frosted-translucent looks on the web - when translucency adds depth, why legibility fails, and the blur, contrast, fallback and performance rules
domain: visual-design
tags: visual-style,glassmorphism,liquid-glass,frosted-glass,translucency,backdrop-filter,aurora
apply_when: "brand words like modern, premium, futuristic, techy, light; hero sections, overlays, navigation bars or cards over photos or gradients; a request mentions glass, frosted, Apple-like or Liquid Glass"
sources: "NN/g - Glassmorphism, Definition and Best Practices (Brown 2024); Wikipedia - Liquid Glass; MDN - backdrop-filter, prefers-reduced-transparency; W3C Understanding WCAG 2.2 SC 1.4.3"
last_reviewed: 2026-09-26
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/visual-design/items/vstyle-glassmorphism.md
copied: 2026-10-09
---

# Glassmorphism and Liquid Glass

## Traits

- Translucent panels that blur what lies behind them, like frosted glass, set over a
  colorful background (gradients, soft color blobs, photos).
- Thin light borders or gradient strokes on panel edges; soft shadows; rounded corners.
- Layers stacked to show depth: background, glass surface, content.
- Often paired with "aurora" backgrounds (large soft blurred color gradients).

NN/g defines it as a style that uses levels of translucency to create depth and contrast
between foreground and background, mimicking frosted glass (Brown 2024).

## Origin

Frosted translucency appeared in operating systems long before the name, for example Windows
Vista's Aero glass (2006, see Frutiger Aero in `vstyle-retro-nostalgia`) and later Apple and
Microsoft system materials (common knowledge, not checked in a read source). The name glassmorphism spread around 2020-2021 on design sites. Apple announced
Liquid Glass at WWDC on 9 June 2025 as the shared language of its 2025 OS releases: glass that
refracts and reflects content and reacts to movement. Its reception was mixed, mainly over
legibility in low-contrast conditions such as bright sunlight, and Apple raised opacity in
some bars and added transparency controls in later builds (Wikipedia, Liquid Glass).

## Fits

- Marketing pages, hero sections and product showcases for tech, fintech, AI and premium
  consumer brands.
- Floating layers: sticky headers, modals, menus, media controls, cards over imagery.
- Interfaces in mixed or virtual reality, where layering over the world is natural (Brown 2024).

## Do not use when

- Text-heavy reading pages, forms, tables and dashboards: body text on a glass panel over a
  changing background cannot keep a stable contrast ratio.
- The audience includes many older users or public-service users.
- Target devices are low-end phones, or the page has many simultaneous blurred layers; blur
  is GPU-heavy (MDN).
- The background is plain white: glass over nothing is just a grey box.

## Accessibility and performance

- Contrast must hold over the worst part of the background, not the average. Body text
  needs 4.5:1 (WCAG 2.2 SC 1.4.3); test with the busiest photo or gradient behind the panel.
- Respect user settings: Windows, macOS and iOS let users reduce transparency. The CSS
  `prefers-reduced-transparency` media feature exposes it, but MDN marks it experimental and
  not Baseline, so use it as an extra and ship a readable default anyway.
- `backdrop-filter` is Baseline 2024 (newly available since September 2024), so older
  browsers need a fallback. It only blurs up to the nearest backdrop root: a parent with
  `opacity`, `filter`, `mask` or `clip-path` breaks the effect for its children (MDN).

```css
.glass { background: rgb(255 255 255 / 0.85); }        /* readable fallback */
@supports (backdrop-filter: blur(1px)) {
  .glass { background: rgb(255 255 255 / 0.55); backdrop-filter: blur(16px) saturate(140%); }
}
```

## Keep it usable

- Use strong blur on busy backgrounds; more blur removes distracting detail (Brown 2024).
- Add a low-opacity or gradient border so the panel edge is visible on simple backgrounds.
- Increase panel opacity behind text; keep glass for chrome (headers, controls) and keep the
  main content on solid surfaces, which is also how Apple's system separates the control layer
  from the content layer.
- Limit to one or two glass layers on screen; avoid animating blurred elements.
- Use established systems' materials (Apple, Microsoft Fluent) as reference values rather
  than inventing opacity by eye (Brown 2024).

## Mixing

- Best as an accent on a minimal or flat 2.0 base; combines with dark mode (glass over dark
  gradients) and with bento cards for product pages.

## Trade-offs

- Adds depth, focus and a premium feel against legibility risk, fallback work and GPU cost.
- Closely tied to a moment in fashion (2020s); expect it to date as other trends did.

## Common mistakes

- White text on light glass over a bright photo.
- Blurring whole page sections, which makes scrolling slow on mid-range phones.
- Forgetting the non-supporting browser path, leaving a transparent unreadable panel.

## Related

- Notes: `vpick-choosing-style`, `vstyle-flat-material`, `vstyle-minimalism-swiss`,
  `a11y-wcag-essentials`, `fe-browser-support-baseline`, `perf-core-web-vitals`
- Skills: `high-end-visual-design`, `ui-ux-pro-max`
