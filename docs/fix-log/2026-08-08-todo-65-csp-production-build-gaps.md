# Fix log entry — 2026-08-08 09:10

## Prompt

Independent recheck of the B65 CSP fix reported two production-safety gaps
(quoted findings — file/line numbers as given):

- High: `server/index.js:60` serves `dist/`, not `client/`, once
  `NODE_ENV=production`. `dist/` is gitignored and was not rebuilt after B65,
  so it still shipped the old unpkg script, inline scripts, and `onclick`
  handlers — all of which the new CSP would block, breaking production
  login/registration/room-start/lobby.
- Medium: `vite.config.js:10` only built `index`/`login`/`room`; `history`,
  `tournament`, `tournament-match` weren't Vite entries, so those routes
  fell through to `login.html` in production.

## Action

Verified both claims directly before touching anything (`git show
main:...`/`ls dist`/`grep unpkg|onclick dist/*.html`/reading
`vite.config.js`) — both were accurate. Then, rather than just doing a one-off
`npm run build` (which wouldn't survive the next real deploy), fixed the
actual gaps in tracked source:

- `vite.config.js`: added `history`/`tournament`/`tournament-match` to
  `rollupOptions.input` so a normal `npm run build` produces all 6 shipped
  pages, not 3.
- Added a `copy-classic-scripts` Vite plugin: Vite's HTML transform only
  bundles `<script type="module">` and `<link rel="stylesheet">` — every
  classic `<script src="js/...">` (the theme/ui-mode preload IIFEs,
  `action-delegate.js`, and history.html's whole non-entry.js script chain)
  was left as a literal unprocessed reference and never copied into `dist/`,
  so it 404'd. The plugin scans `client/*.html` itself for classic script
  references (not a hardcoded list — see below for why that matters) and
  copies each verbatim into `dist/js/` at `closeBundle`.
- Rebuilding fresh and actually running the production build (not just
  reading the config) surfaced a second, worse bug the report hadn't
  named: `escape-utils.js`, `audio-manager.js`, `profanity-filter.js`, and
  `profanity-classifier-model.js` are UMD modules
  (`if (typeof module.exports) {...} else { root.X = ... }`). When
  `index-entry.js`/`room-entry.js`/`tournament-detail-entry.js` imported them
  as bare side-effect ES imports, Vite's commonjs plugin lazily wrapped the
  whole file — the global-attach code (`window.EscapeUtils`,
  `window.audioManager`, `window.ProfanityFilter`, `window.
  ProfanityClassifierModel`) never ran in the actual production bundle.
  `EscapeUtils`/`audioManager` threw a visible `PAGEERROR`; `ProfanityFilter`
  degraded *silently* (`window.ProfanityFilter ? ... : text` fallback), so
  profanity filtering was fully disabled in production with no visible
  symptom. Fixed by dropping the ES import of these 4 files from the three
  entry files and instead loading them as plain classic `<script>` tags in
  `index.html`/`room.html`/`tournament.html`, before the module entry script
  — the same pattern `history.html` already used reliably.
- First pass at the copy-scripts plugin used a hardcoded file list and missed
  `profanity-classifier-model.js`/`profanity-filter.js` — caught by rebuilding
  and re-running the same Playwright pass against the actual `dist/` output
  (MIME-type script-block console errors), not by re-reading the report.
  Replaced the hardcoded list with one scanned from `client/*.html` so this
  can't drift silently again.

## Decision

Same branch-off-`dev` reasoning as the original B65 fix: `vite.config.js`'s
new entries include `client/tournament.html`/`tournament-match.html`, which
don't exist on `main`. `fix/csp-production-build-gaps` branches off `dev`,
merges back to `dev`. `main` will need this same fix (plus the original B65
fix) whenever `dev` next merges into it, or via cherry-pick — noted again
here since it wasn't done as part of this follow-up either.

`dist/` itself is not committed (correctly gitignored, it's a build
artifact) — the fix is in the tracked build *configuration*
(`vite.config.js` + the entry-file import changes), verified by actually
running `npm run build` and driving the output with a real browser, not by
committing a rebuilt `dist/`.

## Summary output

- `npm test`: 850/850 passed (no server-side test-relevant code changed).
- Manual Playwright verification against the **actual production build**
  (`NODE_ENV=production node server/index.js` serving a freshly-built
  `dist/`, real DB moved aside beforehand and restored after — verified
  188416 bytes / 3-row `users` count matching pre-move state):
  - Clean `node_modules/.vite` + `dist/` rebuild was necessary once — a stale
    Vite cache silently kept serving a pre-fix bundle on the first re-verify
    pass, which looked like the fix hadn't worked at all until the cache was
    cleared. Worth knowing for next time: `rm -rf dist node_modules/.vite`
    before trusting a `npm run build` re-run during iteration.
  - login.html: guest login, tab switch, password toggle — 0 console errors.
  - index.html → create room → room.html → sit down at a seat — 0 console
    errors, `window.EscapeUtils`/`window.audioManager` both `'object'`.
  - room.html: `window.ProfanityFilter`/`window.ProfanityClassifierModel`
    both `'object'`, `ProfanityFilter.filterMessage('hello world')` returns
    unmodified text as expected (functioning, not silently degraded).
  - history.html, tournament.html, tournament-match.html (direct load): 0
    console errors, 0 failed requests.
  - `grep -rn "unpkg\|onclick=" dist/*.html`: no matches.
- Branch: `fix/csp-production-build-gaps` off `dev`, merged back to `dev`.
