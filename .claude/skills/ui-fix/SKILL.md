---
name: ui-fix
description: "Fix the findings of a ui-audit report in small, token-first edits and record a Fix results table. Use for 'fix the audit findings', 'apply the ui-audit report', 'ui fix F3'."
argument-hint: "[finding ids, e.g. F1 F3]"
---

# UI Fix

Resolve findings from a `ui-audit-YYYY-MM-DD.md` report with the smallest change each. No unrelated refactors.

Note paths in this skill are under `${SKILLS_TREE:-/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE}/knowledge/...` (set `SKILLS_TREE` when the tree lives elsewhere).

## Steps

1. **Require a report.** Find the newest `ui-audit-*.md` in the project root (or the path given). None, or no findings table: refuse to run and tell the user to run `ui-audit` first. Do not audit and fix in one pass.
2. **Select findings.** Use the ids passed (`F2,F5`); default is every `block` and `major` finding. Read `DESIGN.md` `## Tokens` and `## Forbidden` if present.
3. **Read each finding.** The `rule` column is a rule id from `ui-audit/references/rules.md` or, for findings from `DESIGN.md`, `TOKEN` or `FORBIDDEN`. Parse `note` as `<note-name>#<heading>`: the note is in `knowledge/visual-design/items/` (or `knowledge/web-development/items/`), and the heading is matched by prefix because it may carry a parenthetical suffix. For `TOKEN`/`FORBIDDEN` the note is `DESIGN.md#Tokens` or `DESIGN.md#Forbidden`. Read that section for the reasoning.
4. **Apply one finding at a time**, tokens first: if a token (CSS variable, theme value) drives the problem, change the token before touching any component. Edit only the finding's location, or the token definition when the token propagates to it. No renames, restructures or restyling beyond the finding. For `COL-TOKENS-ONLY` or `TOKEN` findings you may move scattered color literals into a new `:root` token block or the project's existing token file, then reference the variables.
5. **Mark `needs-user`, do not edit,** when the fix would contradict `## Forbidden` or `Style:` in `DESIGN.md`, needs a taste decision (new color, font, layout), or the location no longer matches. For a taste decision read the chosen style's "Do not use when" and "Keep it usable" (`vstyle-*` named in `Style:`, see `vpick-choosing-style`) and put the finding in the reason. Mark `skipped` for findings not selected or already gone.
6. **Write `## Fix results`** to a new file `ui-fix-YYYY-MM-DD.md` in the project root (today's date; overwrite if it exists). Never append to or edit the audit report. Start the file with one line naming the audit report it worked from, then:

```
## Fix results
| id | change (file:line) | status |
|---|---|---|
| F1 | src/app.css:12 added :focus-visible outline | fixed |
```

   Line numbers in the change column are after the edit.

   Status is one of `fixed`, `skipped`, `needs-user`. One row per selected finding.
7. **Re-check.** After all edits, re-run only the affected rules from `ui-audit/references/rules.md` (read-only use of that file; for `TOKEN`/`FORBIDDEN`, recheck the DESIGN.md item) on the changed files. A rule that still fails: set its status back to `needs-user` with the reason, in the `ui-fix` file only.

The audit report stays as is; run /ui-audit again to confirm.
