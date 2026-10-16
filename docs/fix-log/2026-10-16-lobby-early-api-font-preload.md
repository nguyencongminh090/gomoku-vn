# 2026-10-16 23:32 — #263 Lobby critical path: early APIs, font preload, 1.5 s gap
## Prompt
"Do #263"
## Root cause
- Lobby APIs: each fetch lived in an ES module (`lobby-home`, `tournaments`, `platform-shell`), and modules are
  deferred until the whole graph loads and the document parses → APIs serial behind the JS wave (HAR 23-21-10:
  first JS 220 ms, APIs 559 ms).
- Fonts: woff2 discovered only after `manrope/style.css` parsed and text laid out (HAR: 556 ms vs CSS 236 ms).
- 1.5 s gap (HAR 22-09-34): not an idle gap. The page's own RUM beacon (`/cdn-cgi/rum`, `timingsV2`) gives its
  Navigation Timing: connectStart 18 → secureConnectionStart 2396 → connectEnd 2557 → requestStart 2883 →
  responseEnd 3085; first subresource 3138 (+53 ms). The HAR's HTML row (connect 1230, done 1592) understates the
  connection. Real cost = ~2.4 s TCP connect on a cold connection (network path to the CF edge, not app code).
  The rum row at 3138 is the previous document's pagehide beacon (eventType 3), sent when the new one commits.
  Fast HAR 23-21-10 for comparison: reused connection, responseEnd 164, first subresource 219.
## Fix
- New classic `client/js/api-early.js` (after `session.js`, before `socket.io.min.js` and all CSS): starts the 5
  GETs with the same URL + `credentials:'same-origin'`, each only under its consumer's condition (cached user;
  home screen; member; tab visible). Consumers call `GvnEarly.fetch` → takes the in-flight promise once, else a
  real fetch (60 s polls stay fresh). No cached user → nothing (requireAuth bounce).
- `<link rel=preload as=font crossorigin>` for latin, vietnamese, latin-ext (all three requested in every HAR).
- Polling (scope 4): kept. /api/home ~307 B, /api/notifications ~246 B, 60 s, visible tab only, push is primary.
- Not done: a `<link rel=preload as=fetch>` would hit the CORS-mode trap and can't be gated on auth; inline
  script is blocked by CSP `script-src 'self'` → one RTT for api-early.js remains.
## Verification
- `client/tests/api-early.test.js` 19 tests (7 fail on dev); `npm test` 179/3291 green; `?v=388` single.
- Real server copy (fresh DB), Chromium +150 ms latency, 3 runs: APIs dev ~975 ms → ~340 ms (first JS ~170,
  +~175 = 1 RTT); fonts 660 → 170 ms (= CSS wave); each API requested once; no console errors. Firefox local (final
  order): APIs 135 ms before index-entry.js ends (177), counts 1, home renders, bell for members only.
- Unverified: prod cold HAR (done-when "≤ first JS + 100 ms" likely ~+RTT, i.e. not met by construction).
