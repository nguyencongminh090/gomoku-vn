---
name: perf-core-web-vitals
description: The three Core Web Vitals (LCP, INP, CLS) - what each measures, thresholds at the 75th percentile, what causes bad values, and where to start fixing them
domain: web-development
tags: performance,core-web-vitals,lcp,inp,cls,responsiveness,layout-shift
apply_when: "setting or checking web performance targets; a site fails a Web Vitals report; a page feels slow to load, laggy on click, or jumpy; interpreting Lighthouse or Search Console results"
sources: "web.dev - Web Vitals, LCP, INP, CLS, Optimize LCP (all read); MDN - Critical rendering path (read)"
last_reviewed: 2026-09-25
confidence: medium
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/perf-core-web-vitals.md
copied: 2026-10-09
---

# Core Web Vitals

Three user-centred metrics, each judged at the **75th percentile** of real page loads (segmented by mobile and
desktop). A page passes when all three are "good".

| Metric | Measures | Good | Needs improvement | Poor |
|---|---|---|---|---|
| LCP, Largest Contentful Paint | loading: when the largest visible image, video or text block renders | 2.5 s or less | 2.5-4.0 s | over 4.0 s |
| INP, Interaction to Next Paint | responsiveness: latency of clicks, taps and key presses over the whole visit, reporting the worst (ignoring one outlier per 50 interactions) | 200 ms or less | 201-500 ms | over 500 ms |
| CLS, Cumulative Layout Shift | visual stability: the largest burst of unexpected layout shifts | 0.1 or less | 0.1-0.25 | over 0.25 |

## Understanding each metric

**LCP** counts images, video posters, elements with CSS background images and block-level text; it ignores invisible
elements and full-viewport backgrounds, does not look inside iframes, and stops when the user interacts. web.dev splits
it into four parts: time to first byte (about 40 percent of the total), resource load delay (under 10), resource load duration (about 40)
and render delay (under 10). Fixes follow the biggest part: reduce server time and redirects and use a CDN; make the
LCP image discoverable in the initial HTML (not injected by script or lazy-loaded); give it `fetchpriority="high"`;
shrink and properly size it (`fe-media-assets`).

**INP** replaced First Input Delay: it covers every click, tap and key press (not scroll, hover or zoom), not only the first. An
interaction's latency has three phases: input delay (often long tasks blocking the main thread), processing time
of event handlers, and presentation delay until the next frame. Fixes: less JavaScript, split long tasks, do less work in handlers,
avoid heavy rendering after input (`fe-build-tooling`, `fe-framework-choice`).

**CLS** is impact fraction times distance fraction per shift, summed inside a session window (shifts less than 1 s apart,
capped at 5 s). Shifts within 500 ms of a user action and smooth `transform` animations are expected and not counted. Typical causes:
images or embeds without dimensions, late-injected content, ads, and web fonts swapping (`fe-media-assets`). Reserve space, animate
with `transform`, and manage third-party content.

## Using the numbers

- Set these as requirements early (`lifecycle-requirements-nfr`) and measure with field data (`perf-budgets-measurement`).
- Vitals are a floor for user experience, not the whole of performance; general quality attribute theory is in `quality-performance`.
- Thresholds and the metric set have changed before (INP replaced FID); check web.dev for current definitions.

## Use when

- Defining performance goals, diagnosing complaints about speed, or reviewing a release.

## Do not use when

- Do not use Vitals as the only performance measure for backend throughput, batch jobs or non-page apps.
- Do not optimise a lab score at the expense of what real users on slow devices see.

## Trade-offs

- Server rendering and static pages help LCP and can hurt INP if hydration is heavy (`apptype-web-frontend`).
- Richer interactivity and third-party scripts raise INP and CLS risk.

## Common mistakes

- Lazy-loading the hero image.
- Measuring on a fast laptop only.
- Ignoring INP because the load looks fine.
- Fixing the average instead of the 75th percentile.

## Related

- Notes: `perf-budgets-measurement`, `perf-http-caching-cdn`, `perf-loading-critical-path`, `fe-media-assets`,
  `quality-performance`, `apptype-web-frontend`, `lifecycle-requirements-nfr`
