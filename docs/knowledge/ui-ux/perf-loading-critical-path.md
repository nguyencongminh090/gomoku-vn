---
name: perf-loading-critical-path
description: How the browser turns HTML, CSS and JavaScript into pixels, what blocks rendering and parsing, and how script loading attributes, lazy loading and prioritisation shorten the critical path
domain: web-development
tags: critical-rendering-path,render-blocking,defer,async,lazy-loading,code-splitting,performance
apply_when: "first paint or LCP is slow; scripts block the page; deciding defer versus async; deciding what to lazy-load or preload; reading a waterfall chart"
sources: "MDN - Critical rendering path (read); MDN - script element (read); MDN - Lazy loading (read); web.dev - Optimize LCP (read; re-verified 2026-09-26: LCP sub-part breakdown)"
last_reviewed: 2026-09-26
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/perf-loading-critical-path.md
copied: 2026-10-09
---

# Loading and the critical rendering path

## The path (MDN)

1. Parse HTML incrementally into the **DOM**.
2. Parse CSS into the **CSSOM**. CSS is not processed incrementally: later rules can override earlier ones, so the browser needs it complete.
3. Combine into the **render tree** (leaving out invisible content such as `display: none`).
4. **Layout**: compute size and position of each element.
5. **Paint** pixels; later changes repaint only the changed areas.

Two blocking behaviors matter most: **CSS is render-blocking** (nothing paints until it has been received and processed), and
classic **JavaScript is parser-blocking** (parsing pauses to download and run the script, because it may change the DOM).

## What to do

**Minimise critical resources and their size.** Ship only the CSS needed early; use media queries to make non-matching CSS
non-blocking; minify; remove unused code (`fe-build-tooling`).

**Load scripts without blocking the parser (MDN script element):**

| Attribute | Download | Runs | Order |
|---|---|---|---|
| none (classic) | blocks the parser | immediately | in document order |
| `defer` | in parallel | after parsing finishes | in document order |
| `async` | in parallel | as soon as it arrives | not guaranteed |
| `type="module"` | in parallel | deferred by default | in order |

Use `defer` for scripts that depend on the DOM or on each other; `async` for independent scripts such as analytics. `defer` and `async` apply only to
external scripts.

**Defer what is not needed now**: `loading="lazy"` on off-screen images and iframes; code splitting with dynamic `import()`
so only the code for the current view loads; load fonts with `font-display` and, sparingly, `preload` (`fe-media-assets`).
Do not lazy-load the above-the-fold or LCP element, and give it explicit priority (`perf-core-web-vitals`). Always specify image dimensions.

**Prioritise the order**: discoverable early (in the HTML, not created by scripts), important resources first, short chains of dependent requests
(a CSS file that imports another file that references a font delays everything).

**Cut server time**: time to first byte is roughly 40 percent of LCP in web.dev's breakdown; avoid redirects, use caching and a CDN (`perf-http-caching-cdn`), and choose a rendering strategy that gets HTML to the browser early (`apptype-web-frontend`).

**Runtime smoothness**: aim for 60 frames per second in animation; batch DOM updates; avoid animating layout properties (prefer `transform` and opacity); measure first, since micro-optimising selectors rarely pays.

## Use when

- Investigating slow first paint or LCP, or setting conventions for how a site loads assets.

## Do not use when

- Do not preload, prefetch or inline everything; unmeasured hints compete with genuinely critical resources.
- Do not use `async` for scripts that depend on each other.

## Trade-offs

- Inlining critical CSS speeds first paint and adds duplicated bytes and build complexity.
- Aggressive code splitting can create request waterfalls if the split points are chosen badly.

## Common mistakes

- Classic scripts in the head with no `defer`.
- Third-party tags loaded synchronously.
- Hero image loaded by JavaScript.
- Optimising after guessing rather than reading the waterfall.

## Related

- Notes: `perf-core-web-vitals`, `perf-budgets-measurement`, `perf-http-caching-cdn`, `fe-media-assets`,
  `fe-build-tooling`, `fe-html-progressive-enhancement`, `apptype-web-frontend`
