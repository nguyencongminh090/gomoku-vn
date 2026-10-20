---
name: ui-audit
description: "Audit an existing web UI against visual-design rules, read-only, and write a cited findings report. Use for 'audit this UI', 'review the visual design', 'check the CSS against DESIGN.md', 'ui audit'."
---

# UI Audit

Judge an existing UI against `DESIGN.md` (if present) and the visual-design rules. The audit is read-only: never edit project files except writing the report. Items outside the notes (animation duration thresholds, text overflow, palette and font catalogs) are not audited here; see the `ui-ux-pro-max` and `ux-audit` skills.

Note paths in this skill are under `${SKILLS_TREE:-/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE}/knowledge/...` (set `SKILLS_TREE` when the tree lives elsewhere).

## Steps

1. **Baseline.** Look for `DESIGN.md` in the project root. Read its `Style:` (a `vstyle-*` note name), `## Tokens` and `## Forbidden` sections. No `DESIGN.md`: Baseline is `vbase-only` and the report header says so. `DESIGN.md` exists but has no `Style:` line: skip step 2, Baseline stays `DESIGN.md`.
2. **Style notes.** With a style, read `knowledge/visual-design/items/<Style>.md` sections "Keep it usable", "Do not use when", "Common mistakes". Match headings by prefix: in some notes "Keep it usable" carries a suffix such as "(Sheikh 2025, ...)".
3. **Collect the target.** List the files (CSS, SCSS, JSX/TSX, Vue, Svelte, HTML) or screenshots. If the target is a URL without a browser tool, or no screenshots are available, the Mode is `code-only` (with a browser tool a URL can be audited); never invent screenshots. Rules marked "visual" in `detect` are then reported as "not checked (code-only)", not as findings.
4. **Run the rules.** Run every row of `references/rules.md` using its `detect` column, and read the cited `note#section` for the reasoning. For focus and contrast rules (PRI-FOCUS-VISIBLE, COL-CONTRAST-*) also read `a11y-wcag-essentials` (in `knowledge/web-development/items/`). Also check `DESIGN.md` Tokens (literals outside tokens) and each Forbidden item.
5. **Write the report** `ui-audit-YYYY-MM-DD.md` (YYYY-MM-DD is today) in the project root; overwrite it if it already exists. Format:

```
# UI audit
Target: <paths or URL>
Baseline: DESIGN.md | vbase-only
Mode: code-only | with-screenshots
Counts: block N, major N, minor N

| id | severity | location (file:line or region) | evidence | rule | note | suggested fix |
|---|---|---|---|---|---|---|
| F1 | block | src/app.css:12 | `outline: none` on a, button | PRI-FOCUS-VISIBLE | vbase-depth-motion#Signifiers (the key rule) | add a :focus-visible outline |
```

   Target lists several paths comma-separated. For findings from `DESIGN.md`, `rule` is `TOKEN` (literal outside tokens) or `FORBIDDEN` (Forbidden item hit) and `note` is `DESIGN.md#Tokens` or `DESIGN.md#Forbidden`. With zero findings write the table header plus one line `No findings.`. In code-only mode the file ends with a line `Not checked (code-only): <rule ids>`, which stays the last line.
   Ids are `F1..Fn`. Severity is `block`, `major` or `minor` (from the rule; Forbidden hits are `major`). Cap at 25 findings: group repeats of one rule into a single finding listing all locations. Order by severity. Evidence is what you saw, not a judgement; every finding cites a rule and a note.
6. **Close.** Put the finding counts per severity in the report header (a `Counts: block N, major N, minor N` line after `Mode:`), then the findings, then the `Not checked` line last; also state both in your reply. Do not fix anything; hand the report to `ui-fix`.
