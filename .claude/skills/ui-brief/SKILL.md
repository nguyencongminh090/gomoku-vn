---
name: ui-brief
description: "Choose a visual style for a website and write DESIGN.md before any code. Use for 'design a site', 'pick a style', 'restyle', 'make a design brief', 'ui brief'."
---

# UI Brief

Turn a request into a decision, not code. Output is `DESIGN.md` in the project root, laid out as in `references/design-md-template.md`. Notes are in `knowledge/visual-design/items/`; read them, do not copy them.

Note paths in this skill are under `${SKILLS_TREE:-/run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE}/knowledge/...` (set `SKILLS_TREE` when the tree lives elsewhere).

## Steps

1. **Facts.** Fill the five facts of `vpick-choosing-style` "Procedure" (site type and goal, audience, 3-5 brand words, constraints incl. content density, longevity). Ask at most one question per message; propose brand words if the user has none. Use existing site or brand material before asking.
2. **Shortlist.** Use `vpick-style-by-site-type` (matrix) and `vpick-brand-attributes` (words to levers). Apply the hard filters from `vpick-choosing-style` first (accessibility, task-critical, audience, language coverage, performance) and record which applied on the `Hard filters applied:` line under `## Facts`. Check `vpick-trends-longevity` against the longevity fact.
3. **Read candidates.** For each candidate `vstyle-*` read "Fits" and "Do not use when". Match headings by prefix; some notes add a citation suffix. Drop a candidate whose "Do not use when" matches a fact.
4. **Directions.** Present 2-3 (safe, on-brand, optional bold), each with style note, why and risk with its mitigation. The user picks; do not choose silently. Note the cheap validation from `vpick-brand-attributes` Step 3.
5. **Tokens.** Fill color roles from `vbase-color`, the type scale from `vbase-typography` (body at least 16px), spacing unit and radius from `vbase-layout-spacing`, motion from `vbase-depth-motion` (include reduced-motion). Check text contrast pairs meet WCAG AA.
6. **Layout and Forbidden.** Sketch sections and an eye-flow note (`vbase-eye-flow-scanning`); check the hierarchy with `vbase-visual-principles` (one primary action, at most three type sizes per section). Forbidden: bullets from the chosen style's "Do not use when" plus the user's anti-goals.
7. **Write `DESIGN.md`** with the six sections in template order; `Style:` under `## Chosen` is the exact `vstyle-*` note name. If a `DESIGN.md` exists, show a diff-style summary and ask before overwriting; if the user declines, write `DESIGN.new.md` instead.
8. **Hand off.** Suggest `frontend-design` for code, and `ui-ux-pro-max` for code or for palette and font catalogs, if present, and `ui-audit` later to check the result against this file.
