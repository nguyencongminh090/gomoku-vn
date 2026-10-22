# B308 — 87 hex colour literals outside tokens.css
**Status:** ✅ DONE 2026-10-22 — literals moved to role tokens (--c-on-accent/--c-on-ink/--c-knob); only :root definitions remain. ui-audit/ui-fix loop (5 rounds), code-only; no browser pass yet.
**Area:** client/css/main.css (29), shell.css (24), platform.css (20), lobby.css (7), lobby-zen.css (3), platform-shell.css (3), settings-panel.css (1)
**From:** ui-audit 2026-10-22 (`ui-audit-2026-10-22.md`, finding F3), lobby mobile; recorded, not built   **Depends:** —

## Problem
Colours are hard-coded instead of coming from --c-* role tokens. Some may be token fallbacks inside var(); not yet separated.
## Scope
1. List literals per file, drop fallbacks and legit one-offs (board skins).
2. Map each to an existing --c-* token or add one in tokens.css (all themes).
3. Replace file by file; compare screenshots in each theme.
## Don't
- Don't change any rendered colour. Don't touch board/stone skin colours.
## Why this way
Rule COL-TOKENS-ONLY of ui-audit; knowledge note cited in the report row. Full evidence: `ui-audit-2026-10-22.md`.
## Done when
B3080
