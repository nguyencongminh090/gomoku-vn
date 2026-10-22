# 2026-10-22 17:59 — untracked club page (mobile) ui-audit fixes
## Prompt
"/ui-fix F1 - F7" after a code-only ui-audit of club.html (mobile); then "F2 chọn A, F4 chọn 1".
## Root cause
Style-layer gaps, no logic bug: control borders used the 10% divider tint (`--c-border`, ~1.3:1), name links had no resting signifier on touch, overlay shadows/scrims were literals, `.papp` bottom pad ignored the safe-area inset, buttons had no `:active`, form fields were 14px (iOS focus-zoom), three filled primaries in the Manage panel.
## Fix
- platform.css: `--c-border-strong` (55% `--c-ink`) on `.pbtn--ghost`, `.pform` fields, chat/invite inputs; `.ptbl a` underlined; tokens `--scrim`, `--scrim-ring`, `--shadow-pop(-soft)` used by `.pcrop`, `.pcrop__ring`, platform-shell.css menu/bell; `.papp` mobile padding = tab bar + inset + 28px; `:active` on `.pbtn/.pchip/.ptab`; fields 16px at ≤860px.
- club.html: Thêm and Mời are plain `.pbtn` (Lưu stays primary).
- Left alone: 14px body text (user chose fields-only), `.pset__back` / profile / pboard literals. Branch fix/club-mobile-ui-audit off dev; `cache-bust --write` run.
## Verification
`npm test` 3419 passed; `cache-bust.js` OK. CSS-only: contrast, underline, safe-area and 16px fields not covered by jsdom and not seen in a real browser. No regression test added (pure CSS / markup class).
