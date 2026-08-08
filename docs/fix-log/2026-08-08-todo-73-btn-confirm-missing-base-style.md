# Fix log entry — 2026-08-08 15:25

## Prompt

User reported (with 4 screenshots) that buttons on the tournament pages and the game-result modal
looked unstyled — "no css?": the tournament list card's "Bắt đầu"/"Huỷ giải đấu", the tournament
detail banner's "Xem cặp đấu", the pairing card's "Báo giờ"/"Sẵn sàng", and the win-modal's
"Sẵn sàng" button all rendered with plain rectangular default browser button chrome instead of the
app's indigo pill style.

## Action

Diagnosed and filed as `TODO.md #73` first (per this repo's "record, don't perform directly" rule),
then implemented on explicit "Do #73" instruction.

Root cause: `.btn` and `.btn-confirm` had no unscoped base CSS rule reachable outside
`.modal__actions`. The only real `.btn { ... }` definition lived in `login.css` (not loaded on
tournament/lobby pages, and shaped for login's own 2-layer "magnetic button" markup anyway).
`.btn-confirm` had never had an unscoped rule at all — only `.modal__actions .btn-confirm { ... }`
(lobby.css:629). Every other usage (`.pairing-card__actions .btn`, `.tournament-card__actions .btn`,
`.swap2-banner__actions .btn`) only ever set size/flex overrides on top of nothing, so those buttons
fell through to the UA stylesheet.

Fix: added a new unscoped `.btn` (layout: inline-flex/padding/border-radius:9999px/pointer) +
`.btn-confirm` (indigo fill via `var(--c-brand)`, hover/active states matching the existing
`.modal__actions .btn-confirm` look) base rule in `client/css/lobby.css`, placed right after
`.btn-secondary` since `lobby.css` is loaded on every page that needed this (`index.html`,
`tournament.html`, `tournament-match.html`). Left `.modal__actions .btn-confirm` and all other scoped
size-override rules untouched — they still cascade on top of the new base.

Bumped `?v=83` → `?v=84` across every `client/*.html` `<link>`/`<script>` and every
`client/js/*.js` `?v=` import (per `CLAUDE.md`'s cache-busting rule), verified with
`grep -rn "?v=" client/*.html client/js/*.js | grep -v mockup` showing a single `?v=84` value.

## Decision

Branch `fix/btn-confirm-base-style-outside-modal` off `dev` (not `main`) — `TODO.md #73`'s tracking
entry only exists on `dev` (confirmed via `git show main:TODO.md | grep '#7[0-3]'` returning nothing),
per the "fix whose tracking entry only exists on dev" exception in `CLAUDE.md`.

Verified against real code rather than assumption: read every CSS file that could plausibly define
`.btn`/`.btn-confirm`, confirmed the only real base was scoped to `.modal__actions`, and cross-checked
`docs/todo/B70-*.md` to confirm this exact gap was outside that fix's verified scope (its Playwright
screenshots covered `login.html`/`index.html` create-room modal/`room.html`, never the tournament
pages).

## Summary output

Verified with a real running server (fresh throwaway SQLite DB per the Playwright/e2e-safety rule in
`CLAUDE.md` — moved `server/db/gomoku.db` aside, ran against a fresh schema-only DB, restored the real
DB afterward) + Playwright (via the cached `npx playwright` install). Built a probe page served
through the running server's static file handler, loading the real `main.css`/`lobby.css`/
`tournament.css` (with `?v=84`) and reproducing the exact markup from each of the 5 affected call
sites (`tournaments.js:304`, `tournament-detail.js:314`, `tournament-detail.js:383` pairing-card
context, `tournament-match.html:162,179`). `getComputedStyle` on each, in both `light` and `dark`
`prefers-color-scheme`, confirmed all 5 now resolve to `background: rgb(79, 70, 229)` (`--c-brand`),
`color: rgb(255, 255, 255)`, `border-radius: 9999px` — matching the pill shape of the
already-working `.btn-secondary` reference button (screenshot confirms visually). Scoped padding
overrides (`.pairing-card__actions .btn` → `8px 14px` vs default `10px 20px`) still applied correctly
on top. No console/page errors during the probe. No `npm test` run — this is CSS-only and
`client/` has no automated test runner, consistent with prior CSS-only fixes in this repo
(e.g. `docs/todo/B70-*.md`).

Committed on `fix/btn-confirm-base-style-outside-modal` (off `dev`), to be merged back into `dev` with
a regular merge commit and the branch deleted afterward, per `CLAUDE.md`'s git workflow.
