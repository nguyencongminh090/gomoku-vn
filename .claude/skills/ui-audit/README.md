# ui-audit

Authored in this tree on 2026-10-20 (not copied from another project), so there is nothing to redirect except the notes root: note paths use `${SKILLS_TREE:-/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE}`, so set `SKILLS_TREE` when the tree lives elsewhere.

Read-only visual-design audit. It writes `ui-audit-YYYY-MM-DD.md` and edits nothing else. The report table is the input contract for `ui-fix`.

Reads, in place (never copied): `references/rules.md` (41 rules, each pointing at a note section); the six `vbase-*` notes, `vpick-choosing-style`, `a11y-wcag-essentials`, `fe-media-assets` and `fe-css-viewport-and-stacking` in `knowledge/visual-design/items/` and `knowledge/web-development/items/`; and the `vstyle-*` note named in the project's `DESIGN.md`.

Needs in the target project: optional `DESIGN.md` (`Style:`, `## Tokens`, `## Forbidden`). Without it the audit uses `vbase-only` and says so.
