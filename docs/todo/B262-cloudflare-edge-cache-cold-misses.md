# B262 — Cloudflare edge: static assets are almost always cf-cache-status MISS
**Status:** ✅ DONE 2026-10-16 (Smart Tiered Cache ON; warm HAR 28/28 static HIT)
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

## Done when
- Settings before/after recorded; warm-load HIT ratio on static ≥ 90% in a second HAR.

## Log 2026-10-16
- **Before** (zone 5008…c8c9, plan Free): tiered_cache_smart_topology=off; argo tiered_caching=off (not editable, paid);
  Cache Reserve = API 1135 not on plan; Argo smart routing = not authorized (paid); cache_level=aggressive;
  browser_cache_ttl=14400; no cache rules (no http_request_cache_settings entrypoint).
- **Change:** PATCH cache/tiered_cache_smart_topology_enable → on (15:28Z). Rollback: same PATCH value off. Cache Reserve: not on Free.
- **curl re-measure** (this machine, VN; 32 static URLs from the HAR at v=387, 5 passes, new conn per request):
  HIT ratio 56% → 50% → 66% → 72% → 81%. Per PoP over passes 3-5: SIN 25/25, NRT 27/38, HKG 12/20, KIX 2/10.
- **Finding:** HIT wait is also 0.6-1.7 s (MISS 0.9-1.7 s): from this network, the path to the PoP costs about as much as
  the origin fetch. Smart Tiered Cache can only remove the origin hop; it cannot fix the VN→NRT/KIX route.
- **Browser HAR 22-52-23** (VN, reload): static 28/28 HIT, all from SIN, onLoad 859 ms (cold HAR before: 31/44 MISS).
- **HAR 23-21-10** (Disable cache, VN): static 33/33 HIT @HKG, wait 145-180 ms (was MISS 365-575 ms); onLoad 1184 ms.
  The remaining cost is dynamic: 5 `/api/*` at ~320 ms each, plus the WS upgrade (KIX) at 1233 ms wait. Not edge-cache; see #263.
