# B314 — Verify focus ring where outline is removed (lobby.css:572, platform.css:112)
**Status:** ✅ DONE 2026-10-22 — verified: :focus box-shadow ring (lobby.css) and .pl :focus-visible (platform.css) cover both. ui-audit/ui-fix loop (5 rounds), code-only; no browser pass yet.
**Area:** client/css/lobby.css:572, client/css/platform.css:112
**From:** ui-audit 2026-10-22 (`ui-audit-2026-10-22.md`, finding F9), lobby mobile; recorded, not built   **Depends:** —

## Problem
outline:none/0 with no matching :focus-visible found for these two selectors; may be covered by global .pl :focus-visible. Unconfirmed.
## Scope
1. Tab to each control in a real browser; if no visible ring, add a :focus-visible outline.
## Don't
- Don't touch lobby-zen.css:569 (has a 3px box-shadow replacement).
## Why this way
Rule PRI-FOCUS-VISIBLE of ui-audit; knowledge note cited in the report row. Full evidence: `ui-audit-2026-10-22.md`.
## Done when
B3140
