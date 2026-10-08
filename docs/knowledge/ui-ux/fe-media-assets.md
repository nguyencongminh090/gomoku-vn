---
name: fe-media-assets
description: Delivering images and fonts efficiently - formats, responsive images, explicit dimensions, lazy loading (and not for the LCP image), web font loading and layout stability
domain: web-development
tags: images,fonts,srcset,picture,lazy-loading,lcp,cls,font-display,woff2
apply_when: "pages are heavy or shift while loading; adding hero images; choosing image formats; loading custom fonts; the LCP element is an image"
sources: "MDN - Responsive images (read); web.dev - Learn Images (read, overview); web.dev - Font best practices (read); web.dev - Optimize LCP (read); MDN - Lazy loading (read)"
last_reviewed: 2026-09-25
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/fe-media-assets.md
copied: 2026-10-09
---

# Images and fonts

## Images

**Formats** (web.dev course): JPEG is the common photo format; PNG for lossless needs; WebP
and AVIF (based on the AV1 video codec) usually compress better; SVG for vector graphics and
icons; GIF for simple animation. Compress and encode carefully and choose the format by content type.

**Responsive images** (MDN) solve two different problems:

- *Resolution switching*: give the browser several sizes with `srcset` (widths in `w` units) and
  `sizes` (the slot width under media conditions); it picks a file. Use `x` descriptors for a fixed-size image at different pixel densities.
- *Art direction*: use `<picture>` with `<source media=...>` to show different crops or compositions by layout; keep an `<img>` fallback with `alt`.

**Layout stability**: give images `width` and `height` (or an aspect ratio) so the browser
reserves space before the file loads; MDN also lists this for lazy-loaded images.
Missing dimensions are a common cause of layout shift (`lifecycle-requirements-nfr` has the CLS target).

**Lazy loading**: `loading="lazy"` on images and iframes defers off-screen resources. Do not
lazy-load images likely to be the Largest Contentful Paint element: it delays discovery. web.dev's LCP
guidance also says the LCP image should be discoverable in the initial HTML (not injected by
script), can use `fetchpriority="high"`, and that TTFB (time to first byte) is a large share of LCP time,
which a CDN and fewer redirects reduce.

Always write meaningful `alt` text, or `alt=""` for decorative images (`fe-html-progressive-enhancement`).

## Fonts (web.dev best practices)

- Prefer WOFF2 (reported about 30 percent smaller than WOFF).
- Subset with `unicode-range`, especially large scripts; check that Vietnamese diacritics are included in the subset if the site uses them (`webx-i18n-l10n`).
- Reduce the number of files: use system fonts (`system-ui`) or a variable font where suitable.
- Control rendering with `font-display`: `optional` favors performance (text shows within about 100 ms and the web font may be skipped), `swap` shows text at once but can shift, `block` delays text.
- Use `size-adjust` (and related descriptors) on the fallback face to reduce shift when the web font arrives.
- Use `preconnect` for third-party font origins; use `preload` sparingly since it can take priority from other resources.
- Replace icon fonts with SVG (icon fonts can hurt layout shift).

## Use when

- Any page with photos, hero banners, icons or custom typography.

## Do not use when

- Do not build an image pipeline for a handful of small static images; export sensibly and set dimensions.
- Do not preload every font or image; it competes with critical resources.

## Trade-offs

- More formats and sizes reduce bytes and add build steps, markup and storage.
- Custom fonts add brand identity and cost load time and possible shifts; system fonts cost nothing.

## Common mistakes

- Lazy-loading the hero image.
- Serving desktop-size images to phones.
- No dimensions, causing content to jump.
- Loading four font weights when two are used.

## Related

- Notes: `fe-build-tooling`, `fe-html-progressive-enhancement`, `ux-responsive-mobile-first`,
  `lifecycle-requirements-nfr`, `quality-performance`, `data-caching`
