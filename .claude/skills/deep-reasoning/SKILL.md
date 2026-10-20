---
name: deep-reasoning
description: "gomoku-vn's staged reasoning before a hard decision: design / architecture / security / protocol / storage choices, anything size L or hard to reverse, or a root cause that has already resisted one fix. Forces evidence, 2-3 options, a pre-mortem and a recorded conclusion. Skip for size S and already-clear work."
compatibility: claude-code-only
---

# Deep reasoning

Use before committing to a decision that is hard to reverse. Depth by size: **M** = steps 1,2,5 in a few lines; **L** = all five + `advisor`. Size S / obvious work: skip.

1. **Frame.** One sentence: the decision. List hard constraints (CLAUDE.md rules, real DB/data, protocol compat) and what must not break.
2. **Evidence, not memory.** `docs/knowledge/INDEX.md` → matched note only → SKILLS_TREE `tools/find ... -k knowledge` if no hit (`.claude/rules/knowledge.md`). Read the real code with `codegraph_explore`; check `apply_when` / "Do not use when" / `confidence` of each note.
3. **Options.** 2–3 real alternatives (include "do nothing / smaller"). For each: cost, risk, reversibility, what it forces later.
4. **Attack your pick.** Pre-mortem: "it failed in production — why?" Check edge cases, concurrent sessions, data already stored, other pages/clients sharing the entity. If a fact is unverified, verify it or label it as an assumption.
5. **Conclude and record.** Recommendation + the 1–2 reasons that decided it + how it will be verified (test/measurement). Write it in the todo `Reasoning` or fix-log entry with the note paths used. **L only:** call `advisor` before step 5 is final, and if it contradicts evidence you found, reconcile with a second call.

Do not: build before the user says to; re-litigate a decision the user already made; expand scope beyond the item (CLAUDE.md rule 1).
