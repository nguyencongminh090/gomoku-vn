---
name: perf-http-caching-cdn
description: Setting HTTP cache headers for a website - long-lived fingerprinted assets, revalidated HTML, private versus public caches, ETag validation, stale-while-revalidate, and how a CDN fits
domain: web-development
tags: caching,http-cache,cache-control,etag,cdn,fingerprinting,stale-while-revalidate
apply_when: "configuring headers for static assets or HTML; users see stale files after a deploy; deciding what a CDN may cache; personalised pages behind a CDN; improving repeat-visit speed"
sources: "MDN - HTTP caching (read); web.dev - Prevent unnecessary network requests with the HTTP Cache (read); RFC 9111 - HTTP Caching (referenced by MDN, not read directly)"
last_reviewed: 2026-09-25
confidence: high
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/web-development/items/perf-http-caching-cdn.md
copied: 2026-10-09
---

# HTTP caching and CDNs for web pages

The general caching strategies (cache-aside, invalidation, layers) are in `data-caching`. This note is the HTTP layer.

## Two kinds of cache

- **Private cache**: belongs to one client, normally the browser; may store personalised responses.
- **Shared cache**: sits between clients and origin (proxy, CDN, reverse proxy, service worker managed caches) and can serve many users. Anything user-specific must not be stored there: mark it `private`, or `no-store` if it must never be stored.

## The recommended split (MDN and web.dev agree)

| Resource | Headers | Why |
|---|---|---|
| Versioned or fingerprinted assets (`app.3f9c1.js`) | `Cache-Control: public, max-age=31536000, immutable` | the URL changes when content changes, so one year is safe and reloads skip revalidation |
| HTML documents and other unversioned URLs | `Cache-Control: no-cache` (plus `private` if personalised), with `ETag` or `Last-Modified` | forces revalidation on each use; a `304 Not Modified` costs little |
| Sensitive responses | `Cache-Control: no-store` | never stored by any cache |

Definitions to keep straight: `no-cache` means "you may store it but must revalidate before reuse"; `no-store` means "do not store". `max-age` sets freshness lifetime; a response is fresh or stale by its age.
`public` allows shared caches to store it even for authenticated requests; `private` restricts it to the browser.
Validation uses `ETag` with `If-None-Match`, or `Last-Modified` with `If-Modified-Since`, and the server answers 304 if unchanged.

**Cache busting** = changing the URL (hash or version in the file name) so long lifetimes are safe; the build should do this
(`fe-build-tooling`). Set an explicit `Cache-Control`; without one browsers apply heuristic caching. Use consistent URLs (no needless query variations) to avoid duplicate cache entries. Split rarely
changing code from frequently changing code so updates do not invalidate everything. Consider `stale-while-revalidate` when slightly stale data is acceptable.

## CDN

A CDN is a managed shared cache at the edge: it reduces latency and load on the origin, and lowers time to first byte, a large part of LCP (about 40 percent in web.dev's breakdown) (`perf-core-web-vitals`). MDN notes managed caches can be
purged actively when content changes. Points to decide:

- What the CDN caches (static assets by default; HTML only if it is not personalised, or with a deliberate key such as cookies or language in the cache key).
- How you invalidate (purge by URL or tag versus short TTLs).
- That responses with `Set-Cookie` or authentication are handled safely (no cross-user leaks; `appsec-data-protection-privacy`).
- TLS, compression (Brotli or gzip) and HTTP/2 or later at the edge (common practice; not from the two pages read).

## Use when

- Any website; every project should set explicit headers and verify them in the browser's network panel.

## Do not use when

- Do not cache authenticated or personal HTML in a shared cache without a clear key and review.
- Do not put a long `max-age` on a URL that does not change when its content does.

## Trade-offs

- Long caching makes repeat visits instant and makes emergency changes harder; fingerprints solve this for assets, not for HTML.
- A CDN adds speed and another place where configuration errors can expose data.

## Common mistakes

- `max-age` on HTML without revalidation, so users keep an old app shell.
- No cache headers, leaving it to heuristics.
- Caching an error response for a long time.
- Different URLs for the same asset.

## Related

- Notes: `data-caching`, `perf-core-web-vitals`, `perf-budgets-measurement`, `fe-build-tooling`,
  `be-http-semantics`, `deploy-scaling-strategies`, `appsec-data-protection-privacy`
