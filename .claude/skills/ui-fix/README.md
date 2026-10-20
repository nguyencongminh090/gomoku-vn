# ui-fix

Authored in this tree on 2026-10-20 (not copied from another project), so there is nothing to redirect except the notes root: note paths use `${SKILLS_TREE:-/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE}`, so set `SKILLS_TREE` when the tree lives elsewhere.

Applies findings from a `ui-audit` report as small, token-first edits and writes a `## Fix results` table (`id | change (file:line) | status`) to a new `ui-fix-YYYY-MM-DD.md` in the project root, leaving the audit report untouched. It refuses to run without a report.

Consumes: `ui-audit-YYYY-MM-DD.md` (columns `id | severity | location | evidence | rule | note | suggested fix`; `rule` may be `TOKEN` or `FORBIDDEN` for findings from `DESIGN.md`), `DESIGN.md` `## Tokens` and `## Forbidden`, `ui-audit/references/rules.md` (read-only, for re-checks).

Reads, in place (never copied): the six `vbase-*` notes and `vpick-choosing-style` in `knowledge/visual-design/items/`.
