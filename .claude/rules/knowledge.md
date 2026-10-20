---
paths:
  - "docs/knowledge/**"
  - "docs/notes/**"
---
# Reasoning with knowledge (three steps, stop at first hit)
Hard / size-L decisions: use skill `deep-reasoning` (this file is its lookup step).
documented note instead of habit — in this order, stop at the first hit:
1. **Inline** — `docs/knowledge/INDEX.md` (one line per note; read the index, then ONLY the matched note).
   Holds what we use most: project-specific lessons + copied generic notes (each carries its `source:` path).
2. **Reference** — same index lists rare/related SKILLS_TREE notes as **path only** (not copied). Read in place.
3. **Unknown / external** — search the library, don't guess:
   `tools/find` (SKILLS_TREE root and usage: see ~/.claude/CLAUDE.md)  `find "<need, plain English>" -k knowledge`
   (never `python3`; first run may take ~1 min). Read the 1–2 best notes in place; check their `apply_when`,
   **Do not use when** and `confidence` (`low` = verify first). 2+ queries or any copy → delegate to an Agent.
- **Promote or reference:** a note used a 2nd time, or central to this codebase → copy into `docs/knowledge/`
  (keep frontmatter, add `source:` + date) and register it. Rare/one-off → add only a reference row
  (path + one-line "use when") to the index. Never copy whole domains; never edit the SKILLS_TREE original.
- **Precedence:** this CLAUDE.md, `.claude/rules/*`, and user instructions > knowledge notes (generic).
  Cite the note path in the fix-log / todo `Reasoning` when it drove the conclusion.
- Skills: SKILLS_TREE skills are copied into `.claude/skills/` only on request (`find --copy <dest> --pick …`).
