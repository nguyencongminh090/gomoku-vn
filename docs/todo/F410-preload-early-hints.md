# F410 — Correct preload hints + adapt to Cloudflare Early Hints
**Status:** merged dev a0a9d5b + follow-up fix/410-entry-module-hint; CF Rocket Loader turned OFF 2026-11-17 (real cause). Awaiting user Console confirm.
**Area:** server/index.js (new Link-header middleware for `/`, `/index.html`), client/index.html (head hints), scripts/cache-bust.js (hash source), CF zone `play3cr.win` setting `early_hints` (currently ON)
**From:** user 2026-11-17, console on https://play3cr.win: "preloaded with link preload was not used within a few seconds" for index-entry.js, home-challenge.js, challenge-modal.js, action-delegate.js, audio-manager.js, lobby-moves.js, escape-utils.js, skin-preload.js, socket-early.js, socket-client.js, socket.io.min.js, api-early.js, session.js, nunito-latin.woff2. User wants Early Hints KEPT. **Depends:** —

## Problem
`client/index.html` has only 1 `preload` (font, crossorigin OK) + 8 `modulepreload`; origin sends no `Link` header. The warned preloads are not ours: Cloudflare Early Hints (zone setting ON) auto-generates plain `as=script` preloads (even for the `type=module` index-entry.js) that do not match how the page fetches them. The 103 packet itself was NOT observed (curl shows none) — origin of the hints is inferred.
(`performance is null … content-script-start.js` = browser extension, not ours; ignore.)

## Scope
1. Server sends `Link` on `/` + `/index.html`: font `rel=preload; as=font; type=font/woff2; crossorigin`; main CSS `as=style`; classic JS `as=script`; modules `rel=modulepreload`. CF caches Link headers and replays them as 103.
2. Generate the list from `client/index.html` at startup (parse its `<link>`/`<script>` tags) so `?v=` hashes from cache-bust never drift; no second hand-written list.
3. Trim index.html hints to what is needed early; no duplicates.
4. Regression test: Link header == resources/hashes in the HTML. Then `node scripts/cache-bust.js --write`.
5. Real-browser pass (Chrome Network/Console, play3cr.win after deploy): warnings gone, 103 observed.

## Don't
- Don't turn off CF Early Hints (user wants it) unless step 5 shows warnings persist AND user agrees; it is a prod zone change.
- Don't hand-edit `?v=`; don't touch socket-early/api-early ordering (#145/#263: must stay above stylesheets).
- Don't add `crossorigin` to same-origin classic script preloads.

## Traps
- Module + classic script preloads need different `as`/`crossorigin` or the browser refetches.
- Pages other than index (room, club…) may need the same; scope index first.
- CF may still add its own hints beside ours; only the browser check (step 5) tells.
- Related: #125 (CF strips HTML ETag; "Respect Strong ETags" dashboard setting).

## Why this way
Only origin `Link` headers are controllable; CF's auto-generated list is not.

## Done when
- Test green, `cache-bust.js` OK, real-browser console shows no preload warnings, 103 hints match HTML.
