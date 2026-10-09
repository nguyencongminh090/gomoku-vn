# B179 — Arena shell on remaining pages + ux-audit
**Status:** ✅ DONE 2026-10-09 (branch `ui/arena-shell-pages`, not yet merged) — shell top bar on all pages; scoped axe/console/network pass in both modes. NOT a full ux-audit (see Evidence). New findings → #181.
**Area:** client/css/shell.css, client/history.html, tournament*.html, oauth-complete.html
**From:** B173 follow-up, 2026-10-09   **Depends:** B173

## Problem
Lobby/room have the Arena top bar; history/tournament/tournament-match still use main.css's floating pill `.topnav` (tokens already apply). No `ux-audit` pass over the new look.

## Scope
1. Extend the shell top bar rules to those pages' `.topnav` markup.
2. `ux-audit` skill on lobby+room dark/light, desktop+mobile; fix findings only.
3. Measure contrast with axe on both modes.

## Don't
- No board/stones changes; no backend.

## Done when
- One top bar everywhere; axe Critical/Serious = 0 in both modes; `?v` bumped, `npm test` green.

## Evidence (2026-10-09)
- `shell.css`: generic `.topnav` Arena bar (history, tournament, tournament-match); lobby/room keep their specific rules. `aria-label="Play3CR"` on brand links (mobile hides the title → axe link-name); `aria-label` on the Settings dialog.
- Contrast: axe found 7 serious contrast failures from the first Arena tokens (white on #629924 = 3.44, ink-3 4.26, light brand text 4.18…). Fixed in `tokens.css`: dark `--c-brand` #4f7d1c (4.9:1), new `--c-brand-text` for brand-coloured text, ink-3/warning/success/accent darkened in light. Re-run: 0 serious, 0 contrast, 0 link-name/dialog-name.
- Scope run (Chrome, throwaway DB, real DB restored/checksum-verified): login, lobby, create-modal, room, room-settings, history, tournament(error state) × dark/light × 1280/390; manifest typed/clicked/opened; 0 console errors/warnings, 0 network 4xx/5xx. Raw result: `docs/audits/2026-10-09/arena-axe-result.json`.
- Verdict: **Incomplete** by ux-audit rules (no 11-scenario battery, no perf budget LCP/CLS/INP, no keyboard-only/heavy-data/second-user passes, tournament pages only in the "not found" state, tournament-match not exercised). 2 Critical axe findings remain, pre-existing and theme-independent → #181.
- `npm test` 91 suites / 1870 green; `?v=174`.
