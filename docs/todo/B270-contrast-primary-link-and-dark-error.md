# B270 — Contrast: <a>.pbtn--primary label and dark-skin --c-error
**Status:** DONE
**Area:** client/css/platform.css:12/:70, client/css/tokens.css:39
**From:** ux-audit 2026-10-17 (`docs/audits/ux-audit-2026-10-17.md`)   **Depends:** —

## Problem
H1: `.pl a{color:inherit}` (0,1,1) beats `.pbtn--primary` → puzzles "Đăng puzzle mới" 2.91:1. H2: dark `--c-error` #ef6a6a on #33312e = 4.28:1 (forum "đăng quá nhanh").
## Scope
1. Add `.pl a.pbtn--primary { color: var(--c-on-brand); }` after platform.css:70; grep other `<a class="pbtn--primary">`.
2. tokens.css:39 `--c-error` → #f77f7f (5.12:1); re-check the other skins' --c-error.
## Don't
- Don't touch anything beyond the listed lines; no token redesign.
## Done when
- axe color-contrast = 0 on puzzles/forum/clubs in light+dark; cache-bust; fix-log.
