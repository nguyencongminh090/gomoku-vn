---
paths:
  - "features/**"
  - "docs/templates/**"
  - "security_report.md"
  - "issue report.md"
---

# `features/<slug>/` — design discussion before tracked work

Fixed layout (don't rename/omit): `user_story.md` (actors, stories, rules, hard constraints) ·
`diagram/uml_diagram/` (sequence) + `diagram/` (state/class) as Mermaid fenced blocks in `.md` ·
`planning.md` (open questions + sequencing). Cross-link the four with relative links. Doc-only →
may be written straight on `main`.

A feature folder is **not** authorization to implement. Resolve `planning.md`'s open questions with
the user, then formalize into `docs/todo/<CODE>-<slug>.md` + a `TODO.md` line (approach and traps go in
the todo), *then* code.

Triage of external reports (audit, pentest, CVE): see "Security reports" in `.claude/rules/testing.md`
— verify against current code, check prior rulings, close documented tradeoffs.
