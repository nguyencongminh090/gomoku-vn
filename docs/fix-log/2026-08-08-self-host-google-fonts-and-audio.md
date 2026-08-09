# Fix log entry — 2026-08-08 10:00

## Prompt

Do TODO.md #69 / instruction.md B69: self-host Google Fonts + audio assets to stop leaking player
IP/User-Agent to Google/Freesound/GitHub on every page load, per `network_security_audit.md`
(2026-08-08). Follow the B65 Phosphor-icons precedent: vendor the real files, point the
`<link>`/CSS at the local copy, then narrow the CSP `font-src`/`style-src`/`media-src` directives.

## Action

Verified the finding against current code before implementing, per CLAUDE.md's "Security findings"
rule — the audit's font claim held, but its audio claim did not:

- **Fonts (real leak, confirmed):** every non-mockup page loads Manrope (400/500/600/700) from
  `fonts.googleapis.com`/`fonts.gstatic.com`. `room.html` and `history.html` additionally load an
  `Inter` family from `fonts.googleapis.com` that turned out to be dead weight — `grep`ing
  `--font:` across `client/css/*.css` showed only `'Manrope', system-ui, ...` is ever referenced;
  `Inter` is never applied to anything.
- **Audio (claimed leak, not actually happening):** [client/js/audio-manager.js](../../client/js/audio-manager.js)
  defined a `soundSources` object listing 6 `cdn.freesound.org` URLs + 1 `raw.githubusercontent.com`
  URL, matching the audit's description. But grepping every `audioManager.*` call site
  (`room-socket.js`, `settings-panel.js`) showed only `playMoveSound`/`playWinSound`/
  `playLoseSound`/`playTimerTickSound` are ever invoked, and every one of those methods is a Web
  Audio API oscillator/noise synthesizer — none of them read `soundSources`, and nothing else in
  the codebase does either. The object was assigned in the constructor and never used: dead code
  that never actually fetches from Freesound or GitHub, so the CSP's `media-src` allowance for
  those two origins was already inert, not an active leak.

## Decision

- Downloaded Manrope's actual woff2 files from `fonts.gstatic.com` (confirmed SIL OFL 1.1 license —
  freely redistributable, no attribution required) and vendored them at
  `client/vendor/fonts/manrope/`, following the `client/vendor/phosphor/` layout (a `style.css`
  with `@font-face` rules + a `LICENSE` file). Kept latin, latin-ext, and vietnamese subsets
  (matches the app's actual Vietnamese+English UI text) and dropped cyrillic/cyrillic-ext/greek,
  which Google Fonts serves unconditionally to any client but nothing in this app ever displays.
  Discovered Google serves the *same* physical woff2 URL for all four requested weights per subset
  (a variable-font instance under the hood) — vendored 3 files total instead of a naive 4×6=24, and
  declared `font-weight: 400 700` (a range) in each `@font-face` rule to reflect that.
  Replaced every `<link href="https://fonts.googleapis.com/...">` (both the live Manrope one and
  the dead Inter one) plus their `preconnect` tags, across `client/index.html`, `room.html`,
  `login.html`, `history.html`, `tournament.html`, `tournament-match.html`, with a single
  `<link rel="stylesheet" href="vendor/fonts/manrope/style.css?v=79">`. Left the two
  `*-mockup.html` files on their frozen Google Fonts links, per CLAUDE.md's explicit exception for
  those files.
- For audio: since `soundSources` was dead code that never executed a network request, vendoring
  the 7 files (with a Freesound-license audit per instruction.md B69) would add a maintenance
  surface for zero actual privacy benefit. Removed the dead `soundSources` object outright instead
  and corrected the file's header comment, which had claimed "royalty-free audio file loading"
  support that was never wired to anything.
- Narrowed `server/config/csp.js`: removed `https://fonts.googleapis.com` from `styleSrc`,
  `https://fonts.gstatic.com` from `fontSrc`, and both `https://cdn.freesound.org` /
  `https://raw.githubusercontent.com` from `mediaSrc` — all three directives now allow only
  `'self'` (plus `'unsafe-inline'` on style-src, unchanged, and `data:` on font-src, unchanged).
  Updated `server/tests/csp.test.js`'s style-src assertion (previously asserted the Google Fonts
  origin was present) and added two new assertions locking `font-src`/`media-src` down to
  same-origin-only, so a future change can't silently reintroduce a third-party font/media origin.
- Bumped `?v=78` → `?v=79` across every `client/*.html` and `client/js/*.js` occurrence (excluding
  the two mockups), per the CLAUDE.md cache-busting rule, since `client/js/audio-manager.js` and
  the font `<link>` tags both changed.
- Branched off `dev`, not `main`: `main` (currently at `?v=57`, no `tournament.html`/
  `tournaments.js`/vendored Phosphor) is missing the B48 tournament feature and later fixes that
  are only merged into `dev` so far — the files this fix touches (`tournament.html`,
  `tournament-match.html`, current `csp.js`/`audio-manager.js` content) only exist together on
  `dev`. Confirmed this the hard way: an initial attempt to branch off `main` produced merge
  conflicts against files `main` doesn't have at all, per this repo's documented `fix/`-off-`dev`
  exception (precedent: `fix/tournament-match-board-size`, and the `?v=64→65` fix above it in this
  log).

## Summary output

Self-hosted Manrope (3 subset files, `client/vendor/fonts/manrope/`) and removed the dead,
already-inert Freesound/GitHub audio-fetch code, closing every third-party origin the audit
flagged out of the CSP (`styleSrc`/`fontSrc`/`mediaSrc` now `'self'`-only apart from the
pre-existing `'unsafe-inline'`/`data:` allowances). `npm test`: 856/856 green, including the
updated `csp.test.js` assertions for the narrowed directives. Not manually verified in a live
browser in this pass — recommend a hard-reload spot-check on `index.html`/`room.html` to confirm
Manrope renders correctly (no FOUT fallback to `system-ui`) and no `fonts.googleapis.com`/
`cdn.freesound.org` requests appear in the network panel.
