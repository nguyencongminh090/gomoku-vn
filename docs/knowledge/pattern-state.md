---
name: pattern-state
description: State pattern (GoF behavioral) - an object delegates behavior to a current state object that also decides transitions, replacing status-flag conditionals
domain: software-design
tags: gof,behavioral,state-machine,polymorphism
apply_when: "an object behaves differently depending on its lifecycle state and several methods each branch on the same status field; states have their own transition rules"
sources: "Gamma et al. - Design Patterns (1994), State (read 2026-09-26 in the owner's copy: Intent, Applicability, Consequences, Related Patterns); refactoring.guru - State (fetched 2026-09-25, re-verified 2026-09-26: intent, applicability, pros, cons, relations); Wikipedia - State pattern (read 2026-09-26: intent, structure, relation to Strategy)"
last_reviewed: 2026-09-26
confidence: high
source: /run/media/ngmint/Data/Programming/Programming/SKILLS/SKILLS_TREE/knowledge/software-design/items/pattern-state.md
copied: 2026-10-09
---

# State

## Intent

Put the behavior of each state in its own class behind a common interface. The context holds
a reference to the current state object and forwards calls to it. A state can switch the
context to another state, so transitions live next to the behavior they belong to.

## Use when

- Many methods contain the same `if status == ...` / `switch state` block (order lifecycle,
  connection, media player, document workflow).
- There are many states, or states and transitions change often.
- Several states share behavior and duplicated code appears across the branches.

## Do not use when

- There are two or three stable states; a small enum with one conditional is clearer.
- States need no different behavior, only different data: a field is enough.
- The whole machine is better as data: with many states and events, a transition table or a
  state-machine library is easier to review and test than a class per state.
- The variants are chosen from outside and never transition on their own: that is Strategy.

## Trade-offs

| Gain | Cost |
|---|---|
| Removes repeated status conditionals | More classes; behavior of one method is spread over many files |
| New state = new class, existing ones untouched | States must reach the context's data, which couples them to it |
| Transitions are explicit and local | Overkill for small machines |

## Minimal example (Python)

```python
class Draft:
    def publish(self, doc): doc.state = InReview()
class InReview:
    def publish(self, doc): doc.state = Published()
class Published:
    def publish(self, doc): raise ValueError("already published")

class Document:
    def __init__(self): self.state = Draft()
    def publish(self): self.state.publish(self)
```

## Common mistakes

- Also keeping a status field and checking it, so two sources of truth drift apart.
- Creating a new state object on each transition when states are stateless (share them).
- Illegal transitions silently ignored instead of rejected.
- Confusing with Strategy: both delegate to an interchangeable object, but in State the
  states know each other and trigger the switches; strategies stay independent.

## Related

- Skills: `refactor-replace-conditional-with-polymorphism`, `solid-open-closed`
- Notes: `pattern-strategy`, `cleancode-code-smells` (Repeated Switches)
