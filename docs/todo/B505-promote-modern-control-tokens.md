# B505 — Evaluate promoting shared Modern control tokens into platform.css
**Status:** OPEN
**Area:** client/css/platform.css, client/css/replay.css, client/css/puzzles.css
**From:** user instruction in #504 (`features/puzzle-modern/planning.md`), 2026-11-27   **Depends:** B504

## Problem
`replay.css` (`--rp-r`, `--rp-r-lg`, `--rp-ease`, `--rp-ring`, `--rp-elev`, `.rp-tbtn`, `.rp-backbtn`) and `puzzles.css` (`--pz-*`, `.pz-btn`, `.pz-tbtn`, `.pz-seg`, `.pz-backbtn`) duplicate the same Flat 2.0 Modern control tokens and pill primitives because `.pbtn` in `platform.css` is still relied on by social, club, settings, forum, and admin pages.

## Scope
1. Audit remaining `.pbtn` / `.pchip` / `.pseg` consumers across `client/*.html` and `client/js/*.js` to check layout, specificity (`.cl-hq .pbtn` in `club.css`, `.pset` in `platform.css`), and contrast impacts.
2. Decide with the user whether to introduce opt-in Modern primitives in `platform.css` (e.g. `--ctl-*` tokens + `.mbtn` / `.mseg`) or migrate `.pbtn` page-by-page, then deduplicate `replay.css` and `puzzles.css`.
3. Re-run `cache-bust`, `npm test`, and visual checks on affected platform pages.

## Don't
- Mutate `.pbtn` globally without auditing `.cl-hq`, `.pset`, `forum.html`, and `admin.html` overrides first.

## Traps
- `club.css` scopes `.cl-hq .pbtn` at `(0,2,0)` (#474); changing base `.pbtn` properties in `platform.css` can subtly alter inherited padding/border/transition on club and settings pages.

## Why this way
Recorded as a separate architectural decision per #502 (`features/replay-redesign/planning.md` §5) and #504 so Puzzle can ship Modern controls safely without destabilizing other platform pages. Notes: `docs/knowledge/ui-ux/ux-design-systems.md`, `docs/knowledge/ui-ux/fe-css-architecture.md`.

## Done when
- Shared Modern tokens live in one place in `platform.css`, duplicated page-local definitions in `replay.css` / `puzzles.css` are removed, `npm test` + `cache-bust` pass, and audited consumer pages show zero visual regressions.
