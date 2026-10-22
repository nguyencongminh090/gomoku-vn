# 2026-10-22 12:15 — untracked Toast text unreadable in dark mode
## Prompt
"sửa lỗi toast dark mode"
## Root cause
`.toast` (main.css) paints `color: var(--c-on-ink)` on `background: var(--c-ink)`. The ui-audit #308 pass
replaced the old `color:#FFFFFF` literal with `--c-on-ink`, defined `#ffffff` in every skin block. In the
dark blocks (`:root` arena, zen, bento) `--c-ink` is light (#e8e6e1/#ececec/#e9eaf2), so white-on-light
measured ~1.2:1. The literal had the same bug before tokenising; the token made it fixable per mode.
## Fix
tokens.css: dark `--c-on-ink` = that skin's `--c-bg` (#161512, #121212, #14151c); arena light block gets
an explicit `--c-on-ink: #ffffff` (it inherited `:root`, now dark). Zen/bento light already #ffffff.
## Verification
skin-contrast.test.js: new pair `--c-on-ink` on `--c-ink` ≥ 4.5:1 for all 6 skin×mode — failed 3/6
(dark) before, then arena/light after the first edit, 128/128 after. `npm test` 3406 pass; cache-bust OK.
Not viewed in a browser.
