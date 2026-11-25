# 2026-11-25 17:00 — #469 Team pairing card: black stone dot near-invisible in dark mode
## Prompt
"Do #468 - 471"
## Root cause
`.match-stone-dot--black` was a bare `#1a1a1a` fill with no edge (the white dot has `1px #999`),
so on dark-mode cards (`--c-surface` #1e1e1e, contrast ≈1.05:1) it disappeared.
## Fix
`client/css/tournament.css`: black dot gets `border: 1px solid var(--c-ink-3)` — the mode-aware
muted-ink token, ≥3:1 on surface and bg in all 6 skin×mode blocks; both dots now 16 px outer size.
## Verification
New `client/tests/tournament-stone-dot-css.test.js` (rule + WCAG 1.4.11 contrast of the ring vs
surface/bg per tokens block): red before, green after. Real browser: `browser.cjs team`
(own temp DB) → `screenshots/team-boards-{desktop,mobile}.png`, black dot ring visible in dark.
Light mode checked only via the token test (black fill on white card). Full `npm test` green.
