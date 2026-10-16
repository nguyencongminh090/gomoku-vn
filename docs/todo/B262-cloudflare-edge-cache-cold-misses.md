# B262 — Cloudflare edge: static assets are almost always cf-cache-status MISS
**Status:** OPEN
**Area:** Cloudflare dashboard/API settings for play3cr.dpdns.org (no repo code expected); `server/config/staticCache.js` read-only
**From:** HAR `play3cr.dpdns.org_Archive [26-10-16 22-09-34].har`, 2026-10-16   **Depends:** —

## Problem
Cold load from VN: 31/44 requests MISS (26/27 JS/CSS), each MISS = 365–575 ms `wait` through the tunnel to origin.
The PoP changes within one load (HKG, KIX, SIN, MAD, NRT) and edge cache is per-PoP, so each new PoP starts cold.
Caching itself works (phosphor-sprite HIT age=3545; logo-mark MISS then HIT). `Cache-Control` is already correct.

## Scope
1. Read current zone settings (Tiered Cache, Cache Reserve, cache rules, Argo) via the cloudflare MCP/API; record them here.
2. Enable Tiered Cache (Smart) if off; evaluate Cache Reserve (cost/benefit).
3. Re-capture two HARs from VN: one cold, one immediately after reload; compare HIT ratio and `wait`.

## Don't
- Don't change origin `Cache-Control`; don't cache HTML or `/api/*`.

## Traps
- A single HAR hits one PoP; judge by HIT ratio over several loads, not one.
- The second HAR file (22-11-43) is the same page load re-exported — it is not a warm-edge sample.

## Why this way
Misses are an edge-topology cost, not a payload cost. Rejected: bundling assets (fewer requests helps but leaves each MISS slow).
Knowledge: none.

## Done when
- Settings before/after recorded; warm-load HIT ratio on static ≥ 90% in a second HAR.
