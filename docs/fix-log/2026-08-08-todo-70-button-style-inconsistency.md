# Fix log entry — 2026-08-08 13:36

## Prompt

Do TODO.md #70 / instruction.md B70: fix button style inconsistency across `client/` — old green
brand colors still present, `--c-danger` used but never defined, focus-mode chat send button styled
differently from the normal one, `.btn-kick`/`.draw-prompt` hardcoded colors, and a global
`!important` `:active` rule silently overriding local component `:active` rules.

## Action

Two ambiguous points flagged in `docs/todo/B70-*.md` were confirmed with the user via
`AskUserQuestion` before implementing (per `instruction.md`'s explicit "hỏi lại nếu không rõ ý đồ"
guidance for this item):
- `--c-danger` → merge into the existing `--c-error`/`--c-error-bg` tokens rather than defining a
  separate `--c-danger` scale.
- `.btn-kick`'s hardcoded pink → treat as unintentional, standardize to `--c-error`/`--c-error-bg`
  like other danger actions.
- The dead `:active` rule → add `!important` to each local component rule so its intended per-press
  feedback wins over the global default, rather than changing the global rule's value.

Implemented in priority order 1→7 as `docs/todo/B70-*.md` specified (item 8, cosmetic tiers, was
explicitly deferred by the doc itself — "làm sau cùng nếu còn thời gian" — and skipped this round):

1. Old green hex (`#48875f`/`#2c7a4b`/`#3a7050`) → `var(--c-brand)`/`var(--c-brand-dark)` in
   `game.css` (`.game-info__turn--mine`, `.swap2-choice .btn-game`, `.btn-focus`, focus-mode chat
   button).
2. `--c-danger`/`--c-danger-bg` → `--c-error`/`--c-error-bg` in `tournament.css`, `lobby.css`,
   `tournament.html` (left `tournament-detail-mockup.html` untouched — frozen prototype per
   cache-busting rule).
3. Focus-mode chat send button restyled to match the normal `.chat-input button` exactly
   (`var(--radius)`, `var(--c-brand)`, same hover/active transitions).
4. `.btn-kick`: hardcoded pink border/hover → `var(--c-error)`; `border-radius: 4px` →
   `var(--radius)`; removed a duplicate `padding` declaration (dead code, second line was
   overriding the first).
5. `.draw-prompt` + `.btn-draw-accept`/`.btn-draw-decline`: hardcoded palette →
   `var(--c-warning)`/`var(--c-warning-bg)`/`var(--c-ink)`/`var(--c-success)`/`var(--c-error)`.
6. Hardcoded box-shadows → `var(--shadow-sm)`/`var(--shadow)`: `.btn-primary` (login.css),
   `.btn-focus`, `.btn-game--resign:hover` (game.css).
7. Added `!important` to 13 local `:active` rules across `login.css`, `game.css`, `lobby.css`,
   `room.css` that were being silently overridden by `main.css`'s global
   `button:not(:disabled):active { transform: scale(0.97) !important; }`.
8. Bumped cache-busting `?v=80` → `?v=81` across every `client/*.html` and `client/js/*.js` site
   per `CLAUDE.md`; verified exactly one distinct version remains (excluding frozen mockups).

**Verification (real browser, not just code read):** started `server/index.js` against a throwaway
DB per the Playwright/e2e safety rule (moved `server/db/gomoku.db*` aside first, restored + MD5
diffed after). Used Playwright directly (`chromium-cli` unavailable in this environment) to drive
guest login → lobby → create-room modal → room (chat send button, spectators tab with an
injected `.btn-kick` preview row) across both light and dark mode, screenshotting each. Zero
console errors across all pages/themes. Colors, radii, and press-feedback all matched the fixed
CSS in both themes.

## Decision

While verifying item 3 in the browser, found the fix rendered nothing: `.room--focus >
#chat-input-wrapper` used a direct-child combinator, but `#chat-input-wrapper` is nested several
levels deep — so the whole block was already dead CSS regardless of its color content. Asked the
user whether to fix the selector now (still CSS-only) or file separately; user chose fix-now. Fixed
`>` → descendant combinator (matches the sibling `.room--focus .board-canvas-wrap` rule's existing
style one block above).

That fix then exposed a second, deeper bug: `.room--focus .panel-right-shell { display: none
!important; }` hides the entire sidebar ancestor containing `#chat-input-wrapper`, and per the CSS
spec `position: fixed` cannot escape a `display:none` ancestor — the element is removed from the
render tree regardless of its own computed style. Confirmed via
`getBoundingClientRect()` returning all-zero while `getComputedStyle().display` correctly read
`flex`. Fixing this requires moving `#chat-input-wrapper` out of `.panel-right-shell` in HTML or
JS-reparenting it on focus-mode toggle — both outside the CSS-only scope `instruction.md` set for
#70. Filed as `TODO.md #71` / `docs/todo/B71-*.md` + `docs/instruction/B71-*.md` instead of folding
into this fix, per the "New requirements/tasks: stack, don't perform directly" and root-cause rules
in `CLAUDE.md`.

## Summary output

- Branch: `fix/button-style-inconsistency`, based off `dev` (TODO.md #70's tracking entry only
  exists on `dev`, not `main`, per the branch-selection rule in `CLAUDE.md`).
- Files changed: `client/css/{game,lobby,login,room,tournament}.css`, `client/tournament.html`,
  cache-bust bump across every `client/*.html` + `client/js/*.js`, plus
  `TODO.md`/`docs/todo/B70-*.md` status and the new `TODO.md #71`/`instruction.md B71` pair.
- No `npm test` run — this is CSS-only and `client/` has no automated test runner, per the
  bug-fix-workflow rule ("say so explicitly rather than skipping silently").
- No visual regressions found in Playwright screenshots across login/lobby/room, light+dark.
