# 2026-11-17 11:46 — #410 origin Link header for Cloudflare Early Hints
## Prompt
Chrome on play3cr.win: "preloaded using link preload but not used" for most lobby scripts + font. Keep CF Early Hints ON.
## Root cause
Origin sent no `Link`; the hints the browser got did not match how the page fetches (e.g. `as=script` for the module entry).
After the first fix (68e8053) one warning remained: `index-entry.js`. The Link header hinted the module entry itself
(`modulepreload`); with the service worker in front the 200 headers are processed after the parser's
`<script type=module>` already fetched it (perf entries: script t=131 ms, link t=236 ms) → a second, never-consumed preload.
Real root cause of the remaining warning: **Cloudflare Rocket Loader** (zone setting was ON). It rewrote every
`<script>` to `type="<hash>-text/javascript"` / `"<hash>-module"`, made its own `as=script` preloads (credentials-mode
mismatch for the module entry: "preload … not used because the request credentials mode does not match") and ran all
scripts late — also defeating #145's socket-early-before-stylesheets order. Warning persisted with the Link fix live.
## Fix
`server/config/earlyHints.js` builds `Link` for `/` + `/index.html` from client/index.html at startup (classic → as=script,
CSS → as=style, font copied with crossorigin, modulepreload links copied). Follow-up: `<script type=module>` entries get no hint.
No index.html change (no duplicates; its hints are the no-103 fallback).
## Verification
`server/tests/early-hints-link.test.js` (26; the entry tests fail on the old code). curl prod: 103 present, 24 entries = Link minus
modulepreloads (CF drops them). Chrome logged-in lobby: all 15 link-initiated fetches used except the entry → this fix.
2026-11-17 04:50 UTC: zone `rocket_loader` set off via CF API (user chose it; Early Hints stays on). curl: HTML no
longer rewritten. Chrome lobby reload: no rocket-loader, 0 rewritten scripts, index-entry fetched once (script),
socket-early starts with main.css (185 ms). User to confirm Console clean.
