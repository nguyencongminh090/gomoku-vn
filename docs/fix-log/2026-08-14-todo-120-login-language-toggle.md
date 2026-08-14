# Fix log entry — 2026-08-14 22:24

## Prompt

User report (chat, filed to TODO.md #120 first, then "Do #120" in a later
turn): "Login page should have Language Toggle (Vietnamese/English)".

## Action

Found this wasn't a from-scratch feature: `client/js/i18n.js`'s
`DOMContentLoaded` auto-init already tried to mount a language switcher via
`createLangSwitcher()`, targeting `document.querySelector('.card__logo')`.
`client/login.html`'s current `page-split`/`login-shell`/`login-core`
layout (a later redesign) has no element carrying that class anywhere —
confirmed with `grep -rn "card__logo" client/`, which only turned up the
dead selector itself and one unrelated dead CSS rule in `main.css`. The
switcher had been silently failing to mount since that redesign.

Fix, minimal in scope per the filed instruction:
1. `client/login.html` — added `<div class="login-lang-switch-row"></div>`
   inside `<main class="split-right">`, right above `.login-shell`.
2. `client/css/login.css` — new `.login-lang-switch-row` rule: full-width
   flex row, `justify-content: flex-end`, `max-width: 440px` to match
   `.login-shell` so the button lands flush with the card's right edge on
   both desktop and the `align-items: stretch` mobile breakpoint.
3. `client/js/i18n.js:1340` — swapped the dead `.card__logo` selector for
   `.login-lang-switch-row`. `createLangSwitcher()`/`setLanguage()`/
   `getLanguage()` were left untouched.

Left `.card__logo .lang-switch` in `main.css` alone (dead but harmless,
out of scope).

## Decision

Branched `fix/login-language-toggle` off `main` (both the buggy selector
and `login.html` exist there). Brought TODO.md/instruction.md's #120 entry
onto `main` marked done — same pattern as #119/#121's fixes.

Verified in a real browser rather than just Jest, per this repo's "feature
completion checklist" rule for client-only UI changes. Rather than starting
`server/index.js` (which would require the `playwright-e2e-safety`
db-swap dance for a change that touches none of the backend), served
`client/` with a throwaway `python3 -m http.server` on an unused port and
drove it with a one-off Playwright script — `file://` was tried first but
Chromium blocks ES module imports (`login-entry.js` is `type="module"`)
under the `file:` scheme, so a real HTTP origin was needed regardless of
whether the backend was involved.

(Side note: an earlier attempt to start `server/index.js` for this hit
`EADDRINUSE` — the user's own dev server was already running on :3000. The
`server/db/gomoku.db` had already been moved aside per the e2e-safety
skill's step 1 by that point; moved it back immediately since renaming
doesn't invalidate a process's already-open file descriptor, so the live
server was never actually at risk, but the swap was undone once the plan
changed to the static-server approach instead of touching the app server
at all.)

Playwright checks (desktop 1440×900 + mobile 390×844): button renders top-
right, right-aligned to the card; click toggles the button's own label
(EN/VI) and every other page string checked (tab text, field labels, guest
button); a second click round-trips back to the original strings; mobile
viewport shows the button with no horizontal overflow
(`scrollWidth <= clientWidth`).

## Summary output

`client/login.html`, `client/css/login.css`, `client/js/i18n.js` — one
mount-point element, one CSS rule, one selector swap. `client/tests/login-
lang-switch-mount.test.js` (new, jsdom, 4 cases: mounts correctly, the old
selector no longer mounts anything, no throw when no mount point exists,
click toggles language). `npm test`: 1143/1143 pass. `?v=` bumped 122→123,
verified with the cache-bust grep (exactly one distinct value). `fix/login-
language-toggle` merged into `main`, then into `dev`.
