# ui-brief

Authored in this tree on 2026-10-20 (not copied from another project), so there is nothing to redirect except the notes root: note paths use `${SKILLS_TREE:-/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE}`, so set `SKILLS_TREE` when the tree lives elsewhere.

Produces `DESIGN.md` in the target project, the shared baseline for `ui-audit`, `ui-fix` and the hooks. It writes no code; code generation is handed to `frontend-design` or `ui-ux-pro-max` if installed.

Reads, in place (never copied): the four `vpick-*` notes, the six `vbase-*` notes and the candidate `vstyle-*` notes in `knowledge/visual-design/items/`. The file layout is in `references/design-md-template.md`.

Needs in the target project: nothing required. Existing brand material or a current site helps fill the facts.
